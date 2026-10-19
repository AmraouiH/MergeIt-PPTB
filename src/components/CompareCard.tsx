import { useMemo, type KeyboardEvent } from 'react';
import { Button, Checkbox, Input } from '@fluentui/react-components';
import { FilterRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';
import type { ComparisonRow } from '../models/types';
import { Card, EmptyState, ExpandToggle } from './Common';

interface CompareCardProps {
    rows: ComparisonRow[] | null;
    onlyDifferences: boolean;
    hideEmpty: boolean;
    includeOwner: boolean;
    fieldFilter: string;
    onOnlyDifferences: (value: boolean) => void;
    onHideEmpty: (value: boolean) => void;
    onIncludeOwner: (value: boolean) => void;
    onFieldFilter: (value: string) => void;
    onChoice: (logicalName: string, useSlave: boolean) => void;
    onAll: (logicalNames: string[], useSlave: boolean) => void;
    expanded: boolean;
    onToggleExpand: () => void;
}

/**
 * Step 2: field-by-field comparison with a Master / Slave choice per field.
 */
export function CompareCard(props: CompareCardProps) {
    const strings = useStrings();
    const hasComparison = !!props.rows;

    const visibleRows = useMemo(() => {
        if (!props.rows) return [];
        const filter = props.fieldFilter.trim().toLowerCase();
        return props.rows
            .filter((r) => !props.onlyDifferences || !r.areEqual)
            .filter((r) => !props.hideEmpty || !r.bothEmpty)
            .filter((r) => filter.length === 0 || r.displayName.toLowerCase().includes(filter) || r.logicalName.toLowerCase().includes(filter));
    }, [props.rows, props.onlyDifferences, props.hideEmpty, props.fieldFilter]);

    const onKeyDown = (row: ComparisonRow, e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'm') props.onChoice(row.logicalName, false);
        else if (key === 's') props.onChoice(row.logicalName, true);
        else if (key === ' ') props.onChoice(row.logicalName, !row.useSlave);
        else return;
        e.preventDefault();
    };

    return (
        <Card
            step={2}
            title={strings.stepCompareTitle}
            subtitle={strings.stepCompareSubtitle}
            className="mi-card-compare"
            actions={<ExpandToggle expanded={props.expanded} onToggle={props.onToggleExpand} />}
        >
            <div className="mi-toolbar">
                <Button
                    className="mi-btn-master"
                    title={strings.allFromMasterTip}
                    disabled={!hasComparison}
                    onClick={() => props.onAll(
                        visibleRows.map((r) => r.logicalName),
                        false,
                    )}
                >
                    {strings.allFromMaster}
                </Button>
                <Button
                    className="mi-btn-slave"
                    title={strings.allFromSlaveTip}
                    disabled={!hasComparison}
                    onClick={() => props.onAll(
                        visibleRows.map((r) => r.logicalName),
                        true,
                    )}
                >
                    {strings.allFromSlave}
                </Button>
                <Checkbox label={strings.onlyDifferences} checked={props.onlyDifferences} onChange={(_e, d) => props.onOnlyDifferences(!!d.checked)} />
                <Checkbox label={strings.hideEmpty} checked={props.hideEmpty} onChange={(_e, d) => props.onHideEmpty(!!d.checked)} />
                <Checkbox label={strings.includeOwner} checked={props.includeOwner} onChange={(_e, d) => props.onIncludeOwner(!!d.checked)} />
                <div className="mi-toolbar-spacer" />
                <Input
                    className="mi-search"
                    contentBefore={<FilterRegular />}
                    placeholder={strings.filterFieldsCue}
                    disabled={!hasComparison}
                    value={props.fieldFilter}
                    onChange={(_e, d) => props.onFieldFilter(d.value)}
                />
            </div>

            <div className="mi-grid-wrapper">
                {visibleRows.length === 0 ? (
                    <EmptyState text={strings.emptyComparison} />
                ) : (
                    <table className="mi-grid mi-compare-grid">
                        <thead>
                            <tr>
                                <th>{strings.colDisplayName}</th>
                                <th>{strings.colLogicalName}</th>
                                <th className="mi-choice-col mi-text-master">{strings.colMaster}</th>
                                <th className="mi-text-master" title={strings.choiceTip}>
                                    {strings.colMasterValue}
                                </th>
                                <th className="mi-choice-col mi-text-slave">{strings.colSlave}</th>
                                <th className="mi-text-slave" title={strings.choiceTip}>
                                    {strings.colSlaveValue}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row) => {
                                const masterChosen = !row.useSlave && !row.areEqual;
                                const slaveChosen = row.useSlave && !row.areEqual;
                                return (
                                    <tr key={row.logicalName} tabIndex={0} className={row.areEqual ? 'mi-row mi-row-same' : 'mi-row mi-row-diff'} onKeyDown={(e) => onKeyDown(row, e)}>
                                        <td className="mi-field-name">{row.displayName}</td>
                                        <td className="mi-mono">{row.logicalName}</td>
                                        <td className="mi-choice-col" onClick={() => props.onChoice(row.logicalName, false)}>
                                            <span className={`mi-radio mi-radio-master ${!row.useSlave ? 'mi-radio-on' : ''}`} />
                                        </td>
                                        <td className={`mi-value ${masterChosen ? 'mi-value-master' : ''}`} title={strings.choiceTip} onClick={() => props.onChoice(row.logicalName, false)}>
                                            {row.masterDisplay}
                                        </td>
                                        <td className="mi-choice-col" onClick={() => props.onChoice(row.logicalName, true)}>
                                            <span className={`mi-radio mi-radio-slave ${row.useSlave ? 'mi-radio-on' : ''}`} />
                                        </td>
                                        <td className={`mi-value ${slaveChosen ? 'mi-value-slave' : ''}`} title={strings.choiceTip} onClick={() => props.onChoice(row.logicalName, true)}>
                                            {row.slaveDisplay}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </Card>
    );
}
