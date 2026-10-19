import { useEffect, useRef } from 'react';
import { Button, Checkbox, Radio, RadioGroup, Spinner } from '@fluentui/react-components';
import { InfoRegular, MergeRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';
import type { ChildRelationshipInfo, ComparisonRow, MergeMode } from '../models/types';
import { willChange } from '../models/types';
import { Card, ExpandToggle, StatTile } from './Common';

interface MergeCardProps {
    rows: ComparisonRow[] | null;
    hasPair: boolean;
    mode: MergeMode;
    nativeAvailable: boolean;
    onMode: (mode: MergeMode) => void;
    reassignChildren: boolean;
    onReassignChildren: (value: boolean) => void;
    relationships: ChildRelationshipInfo[] | null;
    relationshipsLoading: boolean;
    checkedRelationships: Set<string>;
    onToggleRelationship: (schemaName: string, checked: boolean) => void;
    onMerge: () => void;
    expanded: boolean;
    onToggleExpand: () => void;
}

/**
 * Step 3: merge mode (choice cards), related records to move, statistics and merge button.
 */
export function MergeCard(props: MergeCardProps) {
    const strings = useStrings();
    const { rows } = props;

    const manual = props.mode === 'manual';
    const relationshipsRef = useRef<HTMLDivElement>(null);
    const showRelationships = manual && props.reassignChildren;

    // Bring the related-records panel into view when it appears or its content changes.
    useEffect(() => {
        if (showRelationships) relationshipsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [showRelationships, props.relationships, props.relationshipsLoading]);
    const childrenCount =
        manual && props.reassignChildren && props.relationships
            ? props.relationships.filter((r) => props.checkedRelationships.has(r.schemaName)).reduce((sum, r) => sum + r.count, 0)
            : null;

    return (
        <Card
            step={3}
            title={strings.stepMergeTitle}
            subtitle={strings.stepMergeSubtitle}
            className="mi-card-merge"
            actions={<ExpandToggle expanded={props.expanded} onToggle={props.onToggleExpand} />}
        >
            <div className="mi-merge-scroll">
                <RadioGroup value={props.mode} onChange={(_e, d) => props.onMode(d.value as MergeMode)} className="mi-modes">
                    <label className={`mi-choice ${manual ? 'mi-choice-on' : ''}`}>
                        <Radio value="manual" />
                        <div>
                            <div className="mi-choice-title">{strings.modeManualTitle}</div>
                            <div className="mi-choice-text">{strings.modeManualDescription}</div>
                        </div>
                    </label>
                    <label className={`mi-choice ${!manual ? 'mi-choice-on' : ''} ${props.nativeAvailable ? '' : 'mi-choice-disabled'}`}>
                        <Radio value="native" disabled={!props.nativeAvailable} />
                        <div>
                            <div className="mi-choice-title">{strings.modeNativeTitle}</div>
                            <div className="mi-choice-text">{strings.modeNativeDescription}</div>
                            {!props.nativeAvailable && <div className="mi-choice-note">{strings.modeNativeUnavailable}</div>}
                        </div>
                    </label>
                </RadioGroup>

                <Checkbox
                    className="mi-reassign"
                    label={strings.reassignChildren}
                    title={strings.reassignTip}
                    disabled={!props.hasPair || !manual}
                    checked={props.reassignChildren}
                    onChange={(_e, d) => props.onReassignChildren(!!d.checked)}
                />

                {showRelationships && (
                    <div className="mi-relationships" ref={relationshipsRef}>
                        <div className="mi-rel-header">
                            <span className="mi-rel-title">{strings.reassignTitle}</span>
                            <span className="mi-rel-hint">
                                <InfoRegular /> {strings.reassignHint}
                            </span>
                        </div>
                        {props.relationshipsLoading && <Spinner size="small" labelPosition="after" label={strings.lookingForChildren} className="mi-rel-loading" />}
                        {!props.relationshipsLoading && props.relationships?.length === 0 && <div className="mi-rel-empty">{strings.noChildren}</div>}
                        {!props.relationshipsLoading &&
                            props.relationships?.map((r) => (
                                <Checkbox
                                    key={r.schemaName}
                                    className="mi-rel-item"
                                    checked={props.checkedRelationships.has(r.schemaName)}
                                    onChange={(_e, d) => props.onToggleRelationship(r.schemaName, !!d.checked)}
                                    label={
                                        <span className="mi-rel-label">
                                            <span className="mi-rel-text">
                                                <span className="mi-rel-name">{r.referencingEntityDisplayName}</span>
                                                <span className="mi-rel-path">
                                                    {r.referencingEntity}.{r.referencingAttribute}
                                                </span>
                                            </span>
                                            <span className="mi-rel-count">{strings.recordsBadge(r.count)}</span>
                                        </span>
                                    }
                                />
                            ))}
                    </div>
                )}
            </div>

            <div className="mi-merge-footer">
                <div className="mi-stats">
                    <StatTile tint="accent" caption={strings.statFields} value={rows ? String(rows.length) : '–'} />
                    <StatTile tint="diff" caption={strings.statDifferences} value={rows ? String(rows.filter((r) => !r.areEqual).length) : '–'} />
                    <StatTile tint="success" caption={strings.statChanges} value={rows ? String(rows.filter(willChange).length) : '–'} />
                    <StatTile tint="teal" caption={strings.statChildren} value={rows && childrenCount !== null ? String(childrenCount) : '–'} />
                </div>
                <Button appearance="primary" icon={<MergeRegular />} disabled={!rows || !props.hasPair} onClick={props.onMerge} className="mi-merge-button">
                    {strings.mergeButton}
                </Button>
            </div>
        </Card>
    );
}
