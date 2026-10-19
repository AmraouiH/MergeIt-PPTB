import { useEffect, useState } from 'react';
import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    Field,
    Input,
    MessageBar,
    MessageBarBody,
    SpinButton,
    Textarea,
} from '@fluentui/react-components';
import { ArchiveRegular, ArrowRightRegular, CheckmarkCircleFilled, EditRegular, LinkRegular, MergeRegular, ShieldCheckmarkRegular, WarningRegular } from '@fluentui/react-icons';
import { SystemExcludedAttributes } from '../helpers/attributeFilter';
import { useStrings } from '../i18n/I18nContext';
import type { AttributeInfo, MergePlan, PluginSettings } from '../models/types';
import { MaxTransactionSize } from '../services/mergeService';

// #region Message box

export interface MessageState {
    title: string;
    text: string;
    intent: 'info' | 'success' | 'warning' | 'error';
}

/** Replacement of MessageBox.Show. */
export function MessageDialog(props: { message: MessageState | null; onClose: () => void }) {
    const strings = useStrings();
    const { message } = props;
    return (
        <Dialog open={!!message} onOpenChange={(_e, d) => !d.open && props.onClose()}>
            <DialogSurface className="mi-dialog-small">
                <DialogBody>
                    <DialogTitle className={`mi-dialog-title-${message?.intent ?? 'info'}`}>{message?.title}</DialogTitle>
                    <DialogContent>
                        <div className="mi-pre">{message?.text}</div>
                    </DialogContent>
                    <DialogActions>
                        <Button appearance="primary" onClick={props.onClose}>
                            {strings.ok}
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

// #endregion

// #region Merge confirmation

/** Summary of the plan before the merge: who is kept, what changes, what happens to related records. */
export function ConfirmMergeDialog(props: { plan: MergePlan | null; onConfirm: () => void; onCancel: () => void }) {
    const strings = useStrings();
    const { plan } = props;
    if (!plan) return null;

    const native = plan.mode === 'native';
    const children = plan.relationshipsToReassign.reduce((sum, r) => sum + r.count, 0);
    const operations = children + (Object.keys(plan.masterUpdate).length > 0 ? 1 : 0) + 1;

    return (
        <Dialog open onOpenChange={(_e, d) => !d.open && props.onCancel()}>
            <DialogSurface className="mi-dialog-large mi-confirm-surface">
                <DialogBody>
                    <DialogTitle>
                        <div className="mi-dlg-title">{strings.confirmTitle}</div>
                        <div className="mi-dlg-subtitle">
                            {strings.confirmSubtitle} · {plan.entityDisplayName}
                        </div>
                    </DialogTitle>
                    <DialogContent className="mi-confirm">
                        <div className="mi-merge-flow">
                            <div className="mi-flow-card mi-flow-slave">
                                <span className="mi-flow-role">SLAVE · {strings.confirmDeactivated}</span>
                                <span className="mi-flow-name" title={plan.slaveName}>
                                    {plan.slaveName}
                                </span>
                            </div>
                            <ArrowRightRegular className="mi-flow-arrow" />
                            <div className="mi-flow-card mi-flow-master">
                                <span className="mi-flow-role">MASTER · {strings.confirmKept}</span>
                                <span className="mi-flow-name" title={plan.masterName}>
                                    {plan.masterName}
                                </span>
                            </div>
                        </div>

                        <div className="mi-confirm-tiles">
                            <div className="mi-confirm-tile">
                                <span className="mi-confirm-tile-value">{plan.changes.length}</span>
                                <span className="mi-confirm-tile-caption">{strings.tileFieldsUpdated}</span>
                            </div>
                            <div className="mi-confirm-tile">
                                <span className="mi-confirm-tile-value">{native ? strings.relatedAll : children}</span>
                                <span className="mi-confirm-tile-caption">{strings.tileRelatedMoved}</span>
                            </div>
                            <div className="mi-confirm-tile">
                                <span className="mi-confirm-tile-value mi-confirm-tile-text">{native ? strings.methodNative : strings.methodTransaction}</span>
                                <span className="mi-confirm-tile-caption">{strings.tileMethod}</span>
                            </div>
                        </div>

                        <section className="mi-confirm-section">
                            <h3>{strings.whatHappens}</h3>
                            <ul className="mi-steps">
                                <li>
                                    <EditRegular className="mi-step-icon" />
                                    <span>{strings.stepFields(plan.changes.length)}</span>
                                </li>
                                <li>
                                    <LinkRegular className="mi-step-icon" />
                                    <div>
                                        {native ? strings.stepNativeChildren : children === 0 ? strings.stepNoChildren : strings.stepChildren(children)}
                                        {!native && children > 0 && (
                                            <div className="mi-rel-chips">
                                                {plan.relationshipsToReassign.map((r) => (
                                                    <span key={r.schemaName} className="mi-rel-chip">
                                                        {r.referencingEntityDisplayName} <b>{r.count}</b>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </li>
                                <li>
                                    <ArchiveRegular className="mi-step-icon" />
                                    <span>{native ? strings.stepNativeDeactivate(plan.slaveName) : strings.stepDeactivate(plan.slaveName, plan.inactiveStatusLabel)}</span>
                                </li>
                                {!native && (
                                    <li>
                                        <ShieldCheckmarkRegular className="mi-step-icon mi-step-safe" />
                                        <span>{strings.stepAtomic}</span>
                                    </li>
                                )}
                            </ul>
                        </section>

                        {!native && operations > MaxTransactionSize && (
                            <MessageBar intent="warning">
                                <MessageBarBody>{strings.confirmBatchWarning(MaxTransactionSize)}</MessageBarBody>
                            </MessageBar>
                        )}

                        {plan.changes.length > 0 && (
                            <section className="mi-confirm-section">
                                <h3>{strings.changesTitle}</h3>
                                <div className="mi-grid-wrapper mi-confirm-grid">
                                    <table className="mi-grid">
                                        <thead>
                                            <tr>
                                                <th>{strings.colField}</th>
                                                <th>{strings.colCurrentValue}</th>
                                                <th />
                                                <th>{strings.colNewValue}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {plan.changes.map((c) => (
                                                <tr key={c.logicalName}>
                                                    <td>
                                                        <div className="mi-field-name">{c.displayName}</div>
                                                        <div className="mi-mono">{c.logicalName}</div>
                                                    </td>
                                                    <td className={c.oldValue ? 'mi-old-value' : 'mi-subtle'}>{c.oldValue || strings.empty}</td>
                                                    <td className="mi-change-arrow">→</td>
                                                    <td className={c.newValue ? 'mi-new-value' : 'mi-subtle'}>{c.newValue || strings.empty}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}
                    </DialogContent>
                    <DialogActions position="start">
                        <span className="mi-irreversible">
                            <WarningRegular /> {strings.irreversible}
                        </span>
                    </DialogActions>
                    <DialogActions position="end">
                        <Button onClick={props.onCancel}>{strings.cancel}</Button>
                        <Button appearance="primary" className="mi-confirm-merge" icon={<MergeRegular />} onClick={props.onConfirm}>
                            {strings.mergeNow}
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

/** Result of a successful merge. */
export function MergeResultDialog(props: { plan: MergePlan | null; onClose: () => void }) {
    const strings = useStrings();
    const { plan } = props;
    if (!plan) return null;
    const children = plan.relationshipsToReassign.reduce((sum, r) => sum + r.count, 0);

    return (
        <Dialog open onOpenChange={(_e, d) => !d.open && props.onClose()}>
            <DialogSurface className="mi-dialog-small mi-result-surface">
                <DialogBody>
                    <DialogTitle>
                        <div className="mi-result-head">
                            <CheckmarkCircleFilled className="mi-result-icon" />
                            <div className="mi-dlg-title">{strings.mergeSuccessTitle}</div>
                        </div>
                    </DialogTitle>
                    <DialogContent>
                        <ul className="mi-steps">
                            <li>
                                <span className="mi-dot mi-dot-master" />
                                <span>{strings.resultMasterUpdated(plan.masterName, plan.changes.length)}</span>
                            </li>
                            <li>
                                <span className="mi-dot mi-dot-slave" />
                                <span>{strings.resultSlaveDeactivated(plan.slaveName)}</span>
                            </li>
                            {(plan.mode === 'native' || children > 0) && (
                                <li>
                                    <LinkRegular className="mi-step-icon" />
                                    <span>{plan.mode === 'native' ? strings.resultNativeChildren : strings.resultChildren(children)}</span>
                                </li>
                            )}
                        </ul>
                    </DialogContent>
                    <DialogActions>
                        <Button appearance="primary" onClick={props.onClose}>
                            {strings.done}
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

// #endregion

// #region Options

/** Loading limits and comparison rules (port of OptionsForm). */
export function OptionsDialog(props: { open: boolean; settings: PluginSettings; onSave: (patch: Partial<PluginSettings>) => void; onCancel: () => void }) {
    const strings = useStrings();
    const [draft, setDraft] = useState(props.settings);

    useEffect(() => {
        if (props.open) setDraft(props.settings);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.open]);

    const alwaysExcluded = ['ownerid*', ...SystemExcludedAttributes].join(', ');

    return (
        <Dialog open={props.open} onOpenChange={(_e, d) => !d.open && props.onCancel()}>
            <DialogSurface className="mi-dialog-medium">
                <DialogBody>
                    <DialogTitle>{strings.options}</DialogTitle>
                    <DialogContent className="mi-options">
                        <p className="mi-muted">{strings.optionsSubtitle}</p>

                        <div className="mi-section-title">{strings.optSectionLoading}</div>
                        <Checkbox label={strings.optOnlyReadWrite} checked={draft.onlyReadWriteTables} onChange={(_e, d) => setDraft({ ...draft, onlyReadWriteTables: !!d.checked })} />
                        <Field label={strings.optMaxRecords}>
                            <SpinButton
                                min={1}
                                max={1000000}
                                step={500}
                                value={draft.maxRecords}
                                onChange={(_e, d) => {
                                    const value = d.value ?? Number(d.displayValue);
                                    if (Number.isFinite(value) && value! > 0) setDraft({ ...draft, maxRecords: Math.round(value!) });
                                }}
                            />
                        </Field>

                        <div className="mi-section-title">{strings.optSectionComparison}</div>
                        <Checkbox label={strings.optSmartDefault} checked={draft.smartSlaveDefault} onChange={(_e, d) => setDraft({ ...draft, smartSlaveDefault: !!d.checked })} />
                        <Checkbox
                            label={strings.optIncludeCurrency}
                            checked={draft.includeTransactionCurrency}
                            onChange={(_e, d) => setDraft({ ...draft, includeTransactionCurrency: !!d.checked })}
                        />
                        <Field label={strings.optExcluded} hint={strings.optAlwaysExcluded(alwaysExcluded)}>
                            <Textarea
                                className="mi-mono"
                                value={draft.additionalExcludedAttributes}
                                onChange={(_e, d) => setDraft({ ...draft, additionalExcludedAttributes: d.value })}
                            />
                        </Field>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={props.onCancel}>{strings.cancel}</Button>
                        <Button
                            appearance="primary"
                            onClick={() =>
                                props.onSave({
                                    onlyReadWriteTables: draft.onlyReadWriteTables,
                                    maxRecords: draft.maxRecords,
                                    smartSlaveDefault: draft.smartSlaveDefault,
                                    includeTransactionCurrency: draft.includeTransactionCurrency,
                                    additionalExcludedAttributes: draft.additionalExcludedAttributes,
                                })
                            }
                        >
                            {strings.ok}
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

// #endregion

// #region Search fields

/** Text fields used by the server-side search (port of SearchFieldsForm). */
export function SearchFieldsDialog(props: { open: boolean; candidates: AttributeInfo[]; selected: string[]; onSave: (attributes: string[]) => void; onCancel: () => void }) {
    const strings = useStrings();
    const [checked, setChecked] = useState(new Set(props.selected));
    const [filter, setFilter] = useState('');

    useEffect(() => {
        if (props.open) {
            setChecked(new Set(props.selected));
            setFilter('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.open]);

    const query = filter.trim().toLowerCase();
    const visible = props.candidates.filter((a) => query.length === 0 || a.displayName.toLowerCase().includes(query) || a.logicalName.includes(query));

    return (
        <Dialog open={props.open} onOpenChange={(_e, d) => !d.open && props.onCancel()}>
            <DialogSurface className="mi-dialog-medium">
                <DialogBody>
                    <DialogTitle>{strings.searchFieldsTitle}</DialogTitle>
                    <DialogContent className="mi-options">
                        <p className="mi-muted">{strings.searchFieldsSubtitle}</p>
                        <MessageBar intent="info">
                            <MessageBarBody>{strings.searchFieldsInfo}</MessageBarBody>
                        </MessageBar>
                        <Input placeholder={strings.filterFieldsCue} value={filter} onChange={(_e, d) => setFilter(d.value)} />
                        <div className="mi-checklist">
                            {visible.map((a) => (
                                <Checkbox
                                    key={a.logicalName}
                                    label={`${a.displayName} (${a.logicalName})`}
                                    checked={checked.has(a.logicalName)}
                                    onChange={(_e, d) => {
                                        const next = new Set(checked);
                                        if (d.checked) next.add(a.logicalName);
                                        else next.delete(a.logicalName);
                                        setChecked(next);
                                    }}
                                />
                            ))}
                        </div>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={props.onCancel}>{strings.cancel}</Button>
                        <Button appearance="primary" onClick={() => props.onSave(props.candidates.filter((a) => checked.has(a.logicalName)).map((a) => a.logicalName))}>
                            {strings.ok}
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

// #endregion
