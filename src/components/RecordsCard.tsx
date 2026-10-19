import { useMemo, useState } from 'react';
import { Button, Dropdown, Input, Menu, MenuItem, MenuList, MenuPopover, Option, type PositioningVirtualElement } from '@fluentui/react-components';
import { ArrowSwapRegular, CopyRegular, FilterRegular, PlayRegular, SearchRegular, TableSearchRegular } from '@fluentui/react-icons';
import { formatValue } from '../helpers/valueHelper';
import { useStrings } from '../i18n/I18nContext';
import { MasterTag, SlaveTag } from '../i18n/strings';
import type { DvRecord, EntityDetails, EntityInfo, RecordLoadResult, RecordRef, ViewItem } from '../models/types';
import { recordId } from '../services/recordService';
import { Card, EmptyState, RoleChip, RolePill } from './Common';
import { TablePicker } from './TablePicker';

interface RecordsCardProps {
    tables: EntityInfo[];
    selectedTable?: string;
    onSelectTable: (logicalName: string) => void;
    entity: EntityDetails | null;
    views: ViewItem[];
    selectedViewId: string;
    onViewChange: (viewId: string) => void;
    onLoad: () => void;
    searchText: string;
    onSearchTextChange: (text: string) => void;
    onSearch: () => void;
    onSearchFields: () => void;
    loadResult: RecordLoadResult | null;
    maxRecords: number;
    master: RecordRef | null;
    slave: RecordRef | null;
    selectedRecord: DvRecord | null;
    onSelectRecord: (record: DvRecord | null) => void;
    onSetMaster: () => void;
    onSetSlave: () => void;
    onSwap: () => void;
    onCompare: () => void;
    onCopyId: () => void;
    busy: boolean;
}

/**
 * Step 1: table, view / search, records grid, Master / Slave selection.
 */
export function RecordsCard(props: RecordsCardProps) {
    const strings = useStrings();
    const { entity, loadResult } = props;

    const [menuTarget, setMenuTarget] = useState<PositioningVirtualElement | null>(null);

    // Formatted cells, computed once per load
    const rows = useMemo(() => {
        if (!entity || !loadResult) return [];
        return loadResult.records.map((record) => ({
            id: recordId(entity, record),
            record,
            cells: loadResult.columns.map((c) => formatValue(record, c.key, strings)),
        }));
    }, [entity, loadResult, strings]);

    // Instant local filter on the loaded rows
    const visibleRows = useMemo(() => {
        const filter = props.searchText.trim().toLowerCase();
        return filter.length === 0 ? rows : rows.filter((r) => r.cells.some((c) => c.toLowerCase().includes(filter)));
    }, [rows, props.searchText]);

    const selectedId = props.selectedRecord && entity ? recordId(entity, props.selectedRecord) : null;

    const recordCountLabel = (() => {
        if (!loadResult) return '';
        const source =
            loadResult.sourceKind === 'search'
                ? strings.sourceSearch(loadResult.sourceName ?? '')
                : loadResult.sourceKind === 'view'
                  ? strings.sourceView(loadResult.sourceName ?? '')
                  : strings.sourceActive;
        return strings.recordCount(source, loadResult.records.length) + (loadResult.truncated ? strings.limitReached(props.maxRecords) : '');
    })();

    const viewText = (id: string) => {
        if (id === '') return strings.defaultView;
        const view = props.views.find((v) => v.id === id);
        if (!view) return '';
        return (view.isPersonal ? strings.personalViewPrefix : strings.systemViewPrefix) + view.name + (view.isDefault ? strings.defaultViewSuffix : '');
    };

    const hasEntity = !!entity;
    const hasRecord = !!props.selectedRecord;

    return (
        <Card step={1} title={strings.stepRecordsTitle} subtitle={strings.stepRecordsSubtitle} className="mi-card-records">
            <div className="mi-toolbar">
                {/* A div, not a label: a label would forward the clicks on the list options to the input */}
                <div className="mi-field">
                    <span>{strings.tableLabel}</span>
                    <TablePicker tables={props.tables} selected={props.selectedTable} disabled={props.busy && props.tables.length === 0} onSelect={props.onSelectTable} />
                </div>

                <label className="mi-field">
                    <span>{strings.viewLabel}</span>
                    <Dropdown
                        className="mi-view-dropdown"
                        title={strings.viewsTip}
                        disabled={!hasEntity}
                        value={viewText(props.selectedViewId)}
                        selectedOptions={[props.selectedViewId]}
                        onOptionSelect={(_e, data) => props.onViewChange(data.optionValue ?? '')}
                    >
                        <Option value="" text={strings.defaultView}>
                            {strings.defaultView}
                        </Option>
                        {props.views.map((v) => (
                            <Option key={v.id} value={v.id} text={viewText(v.id)}>
                                {viewText(v.id)}
                            </Option>
                        ))}
                    </Dropdown>
                </label>
                <Button icon={<PlayRegular />} disabled={!hasEntity} onClick={props.onLoad}>
                    {strings.load}
                </Button>

                <div className="mi-toolbar-spacer" />

                <Input
                    className="mi-search"
                    contentBefore={<FilterRegular />}
                    placeholder={strings.searchCue}
                    title={strings.searchBoxTip}
                    disabled={!hasEntity}
                    value={props.searchText}
                    onChange={(_e, data) => props.onSearchTextChange(data.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            props.onSearch();
                        }
                    }}
                />
                <Button icon={<SearchRegular />} title={strings.searchButtonTip} disabled={!hasEntity} onClick={props.onSearch}>
                    {strings.search}
                </Button>
                <Button icon={<TableSearchRegular />} appearance="subtle" disabled={!hasEntity} onClick={props.onSearchFields}>
                    {strings.searchFields}
                </Button>
            </div>

            <div className="mi-grid-wrapper">
                {visibleRows.length === 0 ? (
                    <EmptyState text={entity ? strings.emptyRecords : strings.emptyRecordsNoTable} />
                ) : (
                    <table className="mi-grid mi-records-grid">
                        <thead>
                            <tr>
                                <th className="mi-role-col">{strings.roleColumn}</th>
                                {loadResult!.columns.map((c) => (
                                    <th key={c.key}>{c.header.toUpperCase()}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row) => {
                                const role = props.master?.id === row.id ? 'master' : props.slave?.id === row.id ? 'slave' : null;
                                const classes = ['mi-row', role ? `mi-row-${role}` : '', selectedId === row.id ? 'mi-row-selected' : ''].join(' ');
                                return (
                                    <tr
                                        key={row.id}
                                        className={classes}
                                        onClick={() => props.onSelectRecord(row.record)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            props.onSelectRecord(row.record);
                                            const { clientX: x, clientY: y } = e;
                                            setMenuTarget({ getBoundingClientRect: () => ({ x, y, top: y, left: x, bottom: y, right: x, width: 0, height: 0 }) as DOMRect });
                                        }}
                                    >
                                        <td className="mi-role-col">{role && <RolePill role={role} label={role === 'master' ? MasterTag : SlaveTag} />}</td>
                                        {row.cells.map((cell, index) => (
                                            <td key={index} title={cell}>
                                                {cell}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <Menu open={!!menuTarget} onOpenChange={(_e, data) => !data.open && setMenuTarget(null)} positioning={{ target: menuTarget ?? undefined, position: 'below', align: 'start' }}>
                <MenuPopover>
                    <MenuList>
                        <MenuItem icon={<span className="mi-dot mi-dot-master" />} disabled={!hasRecord} onClick={props.onSetMaster}>
                            {strings.setAsMaster}
                        </MenuItem>
                        <MenuItem icon={<span className="mi-dot mi-dot-slave" />} disabled={!hasRecord} onClick={props.onSetSlave}>
                            {strings.setAsSlave}
                        </MenuItem>
                        <MenuItem icon={<ArrowSwapRegular />} disabled={!props.master && !props.slave} onClick={props.onSwap}>
                            {strings.swapMenu}
                        </MenuItem>
                        <MenuItem icon={<CopyRegular />} disabled={!hasRecord} onClick={props.onCopyId}>
                            {strings.copyId}
                        </MenuItem>
                    </MenuList>
                </MenuPopover>
            </Menu>

            <div className="mi-records-footer">
                <span className="mi-muted">{recordCountLabel}</span>
                <div className="mi-toolbar-spacer" />
                <RoleChip role="master" caption={MasterTag} name={props.master?.name} placeholder={strings.chipNone} />
                <RoleChip role="slave" caption={SlaveTag} name={props.slave?.name} placeholder={strings.chipNone} />
                <Button className="mi-btn-master" disabled={!hasRecord} onClick={props.onSetMaster}>
                    {strings.setAsMaster}
                </Button>
                <Button className="mi-btn-slave" disabled={!hasRecord} onClick={props.onSetSlave}>
                    {strings.setAsSlave}
                </Button>
                <Button icon={<ArrowSwapRegular />} title={strings.swapTip} disabled={!props.master && !props.slave} onClick={props.onSwap}>
                    {strings.swap}
                </Button>
                <Button appearance="primary" title={strings.compareTip} disabled={!props.master || !props.slave} onClick={props.onCompare}>
                    {strings.compare}
                </Button>
            </div>
        </Card>
    );
}
