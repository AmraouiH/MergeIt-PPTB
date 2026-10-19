import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FluentProvider, Spinner } from '@fluentui/react-components';
import { CompareCard } from './components/CompareCard';
import { ConfirmMergeDialog, MergeResultDialog, MessageDialog, OptionsDialog, SearchFieldsDialog, type MessageState } from './components/Dialogs';
import { Header } from './components/Header';
import { MergeCard } from './components/MergeCard';
import { RecordsCard } from './components/RecordsCard';
import { useConnection, useSettings, useToolboxEvents, useToolboxTheme } from './hooks/useToolbox';
import { I18nContext } from './i18n/I18nContext';
import { mergeItDarkTheme, mergeItLightTheme } from './theme';
import { AppTitle, getStrings, type Language } from './i18n/strings';
import type { ChildRelationshipInfo, ComparisonRow, DvRecord, EntityDetails, MergeMode, MergePlan, PluginSettings, RecordLoadResult, RecordRef, ViewItem } from './models/types';
import { errorMessage } from './services/dataverse';
import { buildComparison, buildPlan, countChildRecords, executeMerge, MergeError, supportsNativeMerge } from './services/mergeService';
import { getEntityDetails, getSearchCandidates, getTables, getViews, type TablesResult } from './services/metadataService';
import { executeView, loadActiveRecords, recordId, retrieveFullRecord } from './services/recordService';

/**
 * Tool UI: table selection, Master / Slave selection, field comparison and merge (port of RecordMergerControl.cs).
 * Business logic lives in metadataService, recordService and mergeService.
 */
function App() {
    const { settings, settingsRef, loaded: settingsLoaded, updateSettings } = useSettings();
    const strings = useMemo(() => getStrings(settings.language), [settings.language]);
    const stringsRef = useRef(strings);
    stringsRef.current = strings;

    const { theme, refreshTheme } = useToolboxTheme();
    const { connection, refreshConnection } = useConnection();

    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<MessageState | null>(null);

    const [tables, setTables] = useState<TablesResult | null>(null);
    const [selectedTable, setSelectedTable] = useState<string>();
    const [entity, setEntity] = useState<EntityDetails | null>(null);
    const [views, setViews] = useState<ViewItem[]>([]);
    const [selectedViewId, setSelectedViewId] = useState('');
    const [loadResult, setLoadResult] = useState<RecordLoadResult | null>(null);
    const [searchText, setSearchText] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<DvRecord | null>(null);

    const [master, setMaster] = useState<RecordRef | null>(null);
    const [slave, setSlave] = useState<RecordRef | null>(null);
    const [fullRecords, setFullRecords] = useState<{ master: DvRecord; slave: DvRecord } | null>(null);
    const [rows, setRows] = useState<ComparisonRow[] | null>(null);
    const [includeOwner, setIncludeOwner] = useState(false);
    const [fieldFilter, setFieldFilter] = useState('');

    const [mode, setMode] = useState<MergeMode>('manual');
    const [reassignChildren, setReassignChildren] = useState(false);
    const [relationships, setRelationships] = useState<ChildRelationshipInfo[] | null>(null);
    const [relationshipsLoading, setRelationshipsLoading] = useState(false);
    const [checkedRelationships, setCheckedRelationships] = useState<Set<string>>(new Set());

    const [confirmPlan, setConfirmPlan] = useState<MergePlan | null>(null);
    const [mergeResult, setMergeResult] = useState<MergePlan | null>(null);
    /** Card shown alone in the working area (section 2 or 3), or null for the normal layout. */
    const [expanded, setExpanded] = useState<'compare' | 'merge' | null>(null);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [searchFieldsOpen, setSearchFieldsOpen] = useState(false);

    /** Bumped whenever the table changes: results of older requests are ignored. */
    const generation = useRef(0);
    /** Last loading mode, replayed after a merge. */
    const reloadRef = useRef<(() => void) | null>(null);
    const masterRef = useRef(master);
    const slaveRef = useRef(slave);
    masterRef.current = master;
    slaveRef.current = slave;

    const nativeAvailable = supportsNativeMerge(entity?.logicalName);
    const effectiveMode: MergeMode = mode === 'native' && nativeAvailable ? 'native' : 'manual';

    // #region Helpers

    /** Runs a long operation behind the busy overlay (WorkAsync equivalent). Errors are shown in a message box. */
    const work = useCallback(async <T,>(text: string, action: (progress: (text: string) => void) => Promise<T>, errorContext: string | null, errorTitle = AppTitle): Promise<T | undefined> => {
        setBusy(text);
        try {
            return await action((progress) => setBusy(progress));
        } catch (error) {
            console.error(`MergeIt: ${errorContext ?? errorTitle}`, error);
            const detail = errorMessage(error);
            setMessage({ title: errorTitle, text: errorContext && !(error instanceof MergeError) ? `${errorContext}.\n\n${detail}` : detail, intent: 'error' });
            return undefined;
        } finally {
            setBusy(null);
        }
    }, []);

    const notify = (title: string, body: string, type: 'info' | 'success' | 'warning' | 'error') => {
        window.toolboxAPI.utils.showNotification({ title, body, type, duration: 4000 }).catch(() => undefined);
    };

    const clearComparison = () => {
        setFullRecords(null);
        setRows(null);
        setRelationships(null);
        setCheckedRelationships(new Set());
    };

    const resetState = (clearTables: boolean) => {
        generation.current++;
        if (clearTables) {
            setTables(null);
            setSelectedTable(undefined);
        }
        setEntity(null);
        setViews([]);
        setSelectedViewId('');
        setLoadResult(null);
        reloadRef.current = null;
        setSelectedRecord(null);
        setMaster(null);
        setSlave(null);
        clearComparison();
    };

    // #endregion

    // #region Tables

    /** Loads the mergeable tables, then reselects the last table. */
    const loadTables = async () => {
        resetState(true);
        const current = settingsRef.current;
        const result = await work(stringsRef.current.loadingTables, () => getTables(current.onlyReadWriteTables, stringsRef.current), stringsRef.current.errLoadTables);
        if (!result) return;

        setTables(result);
        if (result.warnings.length > 0) {
            setMessage({ title: AppTitle, text: result.warnings.join('\n'), intent: 'warning' });
        }

        // No table is preselected: the user picks one, then the records are loaded.
    };

    /** Loads the metadata and views of the table, then its active records. */
    const selectEntity = async (logicalName: string) => {
        updateSettings({ lastEntityLogicalName: logicalName });
        resetState(false);
        const gen = generation.current;
        setSelectedTable(logicalName);

        const s = stringsRef.current;
        const result = await work(s.loadingMetadata(logicalName), async () => {
                const details = await getEntityDetails(logicalName, s);
                return [details, await getViews(details.objectTypeCode)] as const;
            }, s.errLoadMetadata(logicalName));
        // The user may have picked another table in the meantime.
        if (!result || gen !== generation.current) return;

        setEntity(result[0]);
        setViews(result[1]);
        setSelectedViewId('');
        await loadDefaultRecords(result[0], gen);
    };

    // #endregion

    // #region Records loading

    const runRecordLoad = async (message: string, load: (progress: (count: number) => void) => Promise<RecordLoadResult>, reload: () => void, gen: number) => {
        reloadRef.current = reload;
        const result = await work(message, (progress) => load((count) => progress(`${message}\n${stringsRef.current.recordsLoaded(count)}`)), stringsRef.current.errLoadRecords);
        if (!result || gen !== generation.current) return;
        setLoadResult(result);
        setSelectedRecord(null);
    };

    /** Default load: active records (paged, limited). */
    const loadDefaultRecords = (target: EntityDetails, gen: number) =>
        runRecordLoad(
            stringsRef.current.loadingActive(target.displayName),
            (progress) => loadActiveRecords(target, null, settingsRef.current.searchFields[target.logicalName] ?? [], settingsRef.current.maxRecords, progress),
            () => loadDefaultRecords(target, gen),
            gen,
        );

    /** Server-side search (like '%text%') on the primary name and the selected search fields. */
    const searchRecords = (target: EntityDetails, text: string, gen: number): Promise<void> => {
        if (text.trim().length === 0) return loadDefaultRecords(target, gen);
        return runRecordLoad(
            stringsRef.current.searching(text.trim()),
            (progress) => loadActiveRecords(target, text, settingsRef.current.searchFields[target.logicalName] ?? [], settingsRef.current.maxRecords, progress),
            () => searchRecords(target, text, gen),
            gen,
        );
    };

    /** Runs the selected view (or the default load). */
    const executeSelectedView = (target: EntityDetails, view: ViewItem | undefined, gen: number): Promise<void> => {
        if (!view) return loadDefaultRecords(target, gen);
        return runRecordLoad(
            stringsRef.current.runningView(view.name),
            (progress) => executeView(target, view, settingsRef.current.maxRecords, stringsRef.current, progress),
            () => executeSelectedView(target, view, gen),
            gen,
        );
    };

    // #endregion

    // #region Master / Slave selection

    const toReference = (record: DvRecord): RecordRef => {
        const id = recordId(entity!, record);
        const name = entity!.primaryNameAttribute ? record[entity!.primaryNameAttribute] : null;
        return { id, name: typeof name === 'string' && name.trim().length > 0 ? name : id };
    };

    const setAsMaster = () => {
        if (!selectedRecord || !entity) return;
        const reference = toReference(selectedRecord);
        if (slave?.id === reference.id) {
            setMessage({ title: AppTitle, text: strings.alreadySlave, intent: 'warning' });
            return;
        }
        setMaster(reference);
        clearComparison();
    };

    const setAsSlave = () => {
        if (!selectedRecord || !entity) return;
        const reference = toReference(selectedRecord);
        if (master?.id === reference.id) {
            setMessage({ title: AppTitle, text: strings.alreadyMaster, intent: 'warning' });
            return;
        }
        setSlave(reference);
        clearComparison();
    };

    const swap = () => {
        if (!master && !slave) return;
        setMaster(slave);
        setSlave(master);
        masterRef.current = slave;
        slaveRef.current = master;

        if (rows && fullRecords && entity && master && slave) {
            // No reload needed: swap the records and rebuild the comparison.
            const swapped = { master: fullRecords.slave, slave: fullRecords.master };
            setFullRecords(swapped);
            setRows(buildComparison(entity, swapped.master, swapped.slave, settingsRef.current, includeOwner, strings));
            refreshChildRelationships(entity, slave, master, mode, reassignChildren);
        } else {
            clearComparison();
        }
    };

    const copyId = async () => {
        if (!selectedRecord || !entity) return;
        await window.toolboxAPI.utils.copyToClipboard(recordId(entity, selectedRecord));
        notify(AppTitle, strings.copied, 'info');
    };

    // #endregion

    // #region Comparison

    /** Retrieves both full records and the attribute metadata, then builds the comparison. */
    const compareRecords = async () => {
        if (!entity || !master || !slave) return;
        const s = stringsRef.current;
        const m = master;
        const sl = slave;
        const gen = generation.current;

        const result = await work(
            s.retrievingForCompare,
            () => Promise.all([getEntityDetails(entity.logicalName, s), retrieveFullRecord(entity, m.id), retrieveFullRecord(entity, sl.id)]),
            s.errRetrieveCompare,
        );
        if (!result || gen !== generation.current || masterRef.current?.id !== m.id || slaveRef.current?.id !== sl.id) return;

        const [details, masterRecord, slaveRecord] = result;
        const inactive = [
            { record: masterRecord, label: `Master : ${m.name}` },
            { record: slaveRecord, label: `Slave : ${sl.name}` },
        ].filter((r) => !r.record || r.record.statecode !== 0);
        if (inactive.length > 0) {
            setMessage({ title: AppTitle, text: `${s.inactiveRecords}\n${inactive.map((r) => r.label).join('\n')}`, intent: 'warning' });
            return;
        }

        setEntity(details);
        setFullRecords({ master: masterRecord!, slave: slaveRecord! });
        setRows(buildComparison(details, masterRecord!, slaveRecord!, settingsRef.current, includeOwner, s));
        refreshChildRelationships(details, m, sl, mode, reassignChildren);
    };

    /** (Re)builds the comparison rows from the records in memory (no server call). */
    const rebuildComparison = (keepChoices: boolean, overrides: { includeOwner?: boolean; settings?: PluginSettings } = {}) => {
        if (!entity || !fullRecords) return;
        const previous = keepChoices && rows ? new Map(rows.map((r) => [r.logicalName, r.useSlave])) : undefined;
        setRows(
            buildComparison(entity, fullRecords.master, fullRecords.slave, overrides.settings ?? settingsRef.current, overrides.includeOwner ?? includeOwner, strings, previous),
        );
    };

    /** Master and Slave choices of a row are mutually exclusive (one source per field). */
    const setChoice = (logicalName: string, useSlave: boolean) => setRows((current) => current?.map((r) => (r.logicalName === logicalName ? { ...r, useSlave } : r)) ?? null);

    const setSourceForRows = (logicalNames: string[], useSlave: boolean) => {
        const names = new Set(logicalNames);
        setRows((current) => current?.map((r) => (names.has(r.logicalName) ? { ...r, useSlave } : r)) ?? null);
    };

    // #endregion

    // #region Child relationships

    const refreshChildRelationships = (target: EntityDetails, m: RecordRef, s: RecordRef, currentMode: MergeMode, reassign: boolean) => {
        setRelationships(null);
        setCheckedRelationships(new Set());
        if (reassign && currentMode === 'manual') {
            countChildRelationships(target, m, s);
        }
    };

    /** Counts the Slave's child records for every 1:N relationship. */
    const countChildRelationships = async (target: EntityDetails, m: RecordRef, s: RecordRef) => {
        if (!tables) return;
        setRelationshipsLoading(true);
        try {
            const warnings: string[] = [];
            const result = await countChildRecords(target, tables.all, m.id, s.id, stringsRef.current, warnings);
            warnings.forEach((w) => console.warn(`MergeIt: ${w}`));
            if (masterRef.current?.id !== m.id || slaveRef.current?.id !== s.id) return;
            setRelationships(result);
            setCheckedRelationships(new Set(result.map((r) => r.schemaName)));
        } catch (error) {
            console.error('MergeIt: child count failed', error);
            setMessage({ title: AppTitle, text: `${stringsRef.current.errCountChildren}.\n\n${errorMessage(error)}`, intent: 'error' });
        } finally {
            setRelationshipsLoading(false);
        }
    };

    const onReassignChildren = (value: boolean) => {
        setReassignChildren(value);
        if (value && entity && master && slave && rows) {
            refreshChildRelationships(entity, master, slave, effectiveMode, true);
        } else if (!value) {
            setRelationships(null);
            setCheckedRelationships(new Set());
        }
    };

    const onMode = (value: MergeMode) => {
        setMode(value);
        if (value === 'manual' && reassignChildren && relationships === null && !relationshipsLoading && entity && master && slave && rows) {
            countChildRelationships(entity, master, slave);
        }
    };

    // MergeIt role colors are defined on <html> so popups and dialogs (portals) follow the theme too.
    useEffect(() => {
        document.documentElement.dataset.miTheme = theme;
    }, [theme]);

    // Escape restores the normal layout when a card is expanded (unless a dialog or a list handles it).
    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role=dialog], [role=listbox], [role=menu]')) setExpanded(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [expanded]);

    // A table without native merge falls back to the manual mode.
    useEffect(() => {
        if (!nativeAvailable && mode === 'native') setMode('manual');
    }, [nativeAvailable, mode]);

    // #endregion

    // #region Merge

    /** Builds the plan, then opens the confirmation. */
    const prepareMerge = () => {
        if (!entity || !master || !slave || !rows || !tables) return;
        const toReassign = effectiveMode === 'manual' && reassignChildren ? (relationships ?? []).filter((r) => checkedRelationships.has(r.schemaName)) : [];
        try {
            setConfirmPlan(buildPlan(entity, tables.all, master, slave, rows, effectiveMode, toReassign, strings));
        } catch (error) {
            setMessage({ title: AppTitle, text: `${strings.errPrepareMerge}.\n\n${errorMessage(error)}`, intent: 'error' });
        }
    };

    /** Runs the confirmed merge. */
    const runMerge = async () => {
        const plan = confirmPlan;
        if (!plan) return;
        setConfirmPlan(null);
        const s = stringsRef.current;

        // The tool cannot be closed while a merge is running.
        await window.toolboxAPI.preventClose().catch(() => false);
        let succeeded = false;
        try {
            succeeded = (await work(s.merging, (progress) => executeMerge(plan, s, progress).then(() => true), null, s.mergeFailedTitle)) === true;
        } finally {
            await window.toolboxAPI.releasePreventClose().catch(() => false);
        }
        if (!succeeded) return;

        console.info(
            `MergeIt: ${plan.mode} merge succeeded on ${plan.entityName}: Master ${plan.masterName} (${plan.masterId}) <- Slave ${plan.slaveName} (${plan.slaveId}). ` +
                `${plan.changes.length} field(s) updated, ${plan.relationshipsToReassign.length} relationship(s) reassigned.`,
        );
        notify(s.mergeSuccessTitle, `${plan.masterName} ← ${plan.slaveName}`, 'success');
        setMergeResult(plan);

        setMaster(null);
        setSlave(null);
        masterRef.current = null;
        slaveRef.current = null;
        clearComparison();
        reloadRef.current?.();
    };

    // #endregion

    // #region Options / settings

    const saveOptions = (patch: Partial<PluginSettings>) => {
        const onlyReadWrite = settingsRef.current.onlyReadWriteTables;
        const next = updateSettings(patch);
        setOptionsOpen(false);

        // The privilege filter changed: the table list must be reloaded.
        if (onlyReadWrite !== next.onlyReadWriteTables) {
            loadTables();
            return;
        }
        // Exclusions may have changed: rebuild the comparison while keeping the choices.
        rebuildComparison(true, { settings: next });
    };

    const saveSearchFields = (attributes: string[]) => {
        setSearchFieldsOpen(false);
        if (!entity) return;
        updateSettings({ searchFields: { ...settingsRef.current.searchFields, [entity.logicalName]: attributes } });
    };

    // #endregion

    // #region Lifecycle / connection

    // Loads the tables once the settings are known and a connection is available.
    useEffect(() => {
        if (!settingsLoaded) return;
        (async () => {
            const current = await refreshConnection();
            if (current) await loadTables();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingsLoaded]);

    // Connection changed: reset the state and reload the tables.
    useToolboxEvents(async (event) => {
        if (event === 'connection:updated' || event === 'connection:created' || event === 'connection:deleted') {
            const current = await refreshConnection();
            if (current) await loadTables();
            else resetState(true);
        } else if (event === 'settings:updated') {
            refreshTheme();
        }
    });

    // #endregion

    const searchCandidates = useMemo(() => (entity ? getSearchCandidates(entity) : []), [entity]);

    return (
        // No layout class on the provider: Fluent copies it onto the portal node of popups (listboxes, menus, dialogs)
        <FluentProvider theme={theme === 'dark' ? mergeItDarkTheme : mergeItLightTheme} className="mi-provider">
            <I18nContext.Provider value={strings}>
                <div className={`mi-root mi-theme-${theme}`}>
                    <Header
                        connectionName={connection?.name}
                        language={settings.language}
                        busy={!!busy}
                        onReloadTables={loadTables}
                        onOptions={() => setOptionsOpen(true)}
                        onLanguage={(language: Language) => updateSettings({ language })}
                    />

                    <main className={expanded ? `mi-main mi-expanded mi-expanded-${expanded}` : 'mi-main'}>
                        <RecordsCard
                            tables={tables?.mergeable ?? []}
                            selectedTable={selectedTable}
                            onSelectTable={selectEntity}
                            entity={entity}
                            views={views}
                            selectedViewId={selectedViewId}
                            onViewChange={setSelectedViewId}
                            onLoad={() =>
                                entity &&
                                executeSelectedView(
                                    entity,
                                    views.find((v) => v.id === selectedViewId),
                                    generation.current,
                                )
                            }
                            searchText={searchText}
                            onSearchTextChange={setSearchText}
                            onSearch={() => entity && searchRecords(entity, searchText, generation.current)}
                            onSearchFields={() => setSearchFieldsOpen(true)}
                            loadResult={loadResult}
                            maxRecords={settings.maxRecords}
                            master={master}
                            slave={slave}
                            selectedRecord={selectedRecord}
                            onSelectRecord={setSelectedRecord}
                            onSetMaster={setAsMaster}
                            onSetSlave={setAsSlave}
                            onSwap={swap}
                            onCompare={compareRecords}
                            onCopyId={copyId}
                            busy={!!busy}
                        />

                        <div className="mi-bottom">
                            <CompareCard
                                rows={rows}
                                onlyDifferences={settings.showOnlyDifferences}
                                hideEmpty={settings.hideEmptyOnBothSides}
                                includeOwner={includeOwner}
                                fieldFilter={fieldFilter}
                                onOnlyDifferences={(value) => updateSettings({ showOnlyDifferences: value })}
                                onHideEmpty={(value) => updateSettings({ hideEmptyOnBothSides: value })}
                                onIncludeOwner={(value) => {
                                    setIncludeOwner(value);
                                    rebuildComparison(true, { includeOwner: value });
                                }}
                                onFieldFilter={setFieldFilter}
                                onChoice={setChoice}
                                onAll={setSourceForRows}
                                expanded={expanded === 'compare'}
                                onToggleExpand={() => setExpanded((current) => (current === 'compare' ? null : 'compare'))}
                            />
                            <MergeCard
                                rows={rows}
                                hasPair={!!master && !!slave}
                                mode={effectiveMode}
                                nativeAvailable={nativeAvailable}
                                onMode={onMode}
                                reassignChildren={reassignChildren}
                                onReassignChildren={onReassignChildren}
                                relationships={relationships}
                                relationshipsLoading={relationshipsLoading}
                                checkedRelationships={checkedRelationships}
                                onToggleRelationship={(schemaName, checked) =>
                                    setCheckedRelationships((current) => {
                                        const next = new Set(current);
                                        if (checked) next.add(schemaName);
                                        else next.delete(schemaName);
                                        return next;
                                    })
                                }
                                onMerge={prepareMerge}
                                expanded={expanded === 'merge'}
                                onToggleExpand={() => setExpanded((current) => (current === 'merge' ? null : 'merge'))}
                            />
                        </div>
                    </main>

                    <ConfirmMergeDialog plan={confirmPlan} onConfirm={runMerge} onCancel={() => setConfirmPlan(null)} />
                    <OptionsDialog open={optionsOpen} settings={settings} onSave={saveOptions} onCancel={() => setOptionsOpen(false)} />
                    <SearchFieldsDialog
                        open={searchFieldsOpen}
                        candidates={searchCandidates}
                        selected={entity ? (settings.searchFields[entity.logicalName] ?? []) : []}
                        onSave={saveSearchFields}
                        onCancel={() => setSearchFieldsOpen(false)}
                    />
                    <MergeResultDialog plan={mergeResult} onClose={() => setMergeResult(null)} />
                    <MessageDialog message={message} onClose={() => setMessage(null)} />

                    {busy && (
                        <div className="mi-busy" role="status" aria-live="polite">
                            <div className="mi-busy-box">
                                <Spinner size="medium" />
                                <div className="mi-pre">{busy}</div>
                            </div>
                        </div>
                    )}
                </div>
            </I18nContext.Provider>
        </FluentProvider>
    );
}

export default App;
