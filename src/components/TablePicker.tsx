import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Input } from '@fluentui/react-components';
import { ChevronDownRegular, DismissRegular, TableRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';
import type { EntityInfo } from '../models/types';

interface TablePickerProps {
    tables: EntityInfo[];
    selected?: string;
    disabled?: boolean;
    onSelect: (logicalName: string) => void;
}

const MaxVisible = 300;
const labelOf = (t: EntityInfo) => `${t.displayName} (${t.logicalName})`;

/**
 * Searchable table list: typing filters on the display name or the logical name.
 * The list is positioned with `position: fixed` so the card's overflow never clips it.
 */
export function TablePicker(props: TablePickerProps) {
    const strings = useStrings();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const selectedTable = props.tables.find((t) => t.logicalName === props.selected);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return props.tables;
        return props.tables.filter((t) => t.displayName.toLowerCase().includes(q) || t.logicalName.toLowerCase().includes(q));
    }, [props.tables, query]);
    const visible = filtered.slice(0, MaxVisible);

    const openList = () => {
        if (props.disabled) return;
        setQuery('');
        const index = props.tables.findIndex((t) => t.logicalName === props.selected);
        setActive(Math.max(0, index));
        setOpen(true);
    };

    const close = () => {
        setOpen(false);
        setQuery('');
    };

    const choose = (table: EntityInfo | undefined) => {
        if (!table) return;
        close();
        inputRef.current?.blur();
        if (table.logicalName !== props.selected) props.onSelect(table.logicalName);
    };

    // Position the panel under the input (fixed: not clipped by the card)
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.min(Math.max(rect.width, 460), window.innerWidth - rect.left - 12);
            const below = window.innerHeight - rect.bottom - 12;
            const above = rect.top - 12;
            const openUp = below < 220 && above > below;
            setPanelStyle({
                left: rect.left,
                width,
                maxHeight: Math.min(380, openUp ? above : below),
                ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);

    // Close when clicking outside
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) close();
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Keep the active option visible
    useEffect(() => {
        if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) openList();
            else setActive((i) => Math.min(i + 1, visible.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open) choose(visible[active]);
            else openList();
        } else if (e.key === 'Escape') {
            close();
        } else if (e.key === 'Tab') {
            close();
        }
    };

    return (
        <div ref={rootRef} className="mi-table-picker" title={strings.filterTablesTip}>
            <Input
                input={{ ref: inputRef, spellCheck: false, autoComplete: 'off', role: 'combobox', 'aria-expanded': open, 'aria-controls': 'mi-table-list' }}
                className="mi-table-combo"
                contentBefore={<TableRegular />}
                contentAfter={
                    open && query ? (
                        <DismissRegular className="mi-picker-icon" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery('')} />
                    ) : (
                        <ChevronDownRegular
                            className="mi-picker-icon"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => (open ? close() : (openList(), inputRef.current?.focus()))}
                        />
                    )
                }
                placeholder={open ? (selectedTable ? labelOf(selectedTable) : strings.tablePlaceholder) : strings.tablePlaceholder}
                disabled={props.disabled}
                value={open ? query : selectedTable ? labelOf(selectedTable) : ''}
                onFocus={() => !open && openList()}
                onClick={() => !open && openList()}
                onChange={(_e, data) => {
                    setQuery(data.value);
                    setActive(0);
                    if (!open) setOpen(true);
                }}
                onKeyDown={onKeyDown}
            />

            {open && (
                <div ref={listRef} id="mi-table-list" role="listbox" className="mi-picker-panel" style={panelStyle}>
                    <div className="mi-picker-count">{strings.tableCount(filtered.length, props.tables.length)}</div>
                    {visible.length === 0 && <div className="mi-picker-empty">{strings.noTableMatch}</div>}
                    {visible.map((t, index) => (
                        <div
                            key={t.logicalName}
                            data-index={index}
                            role="option"
                            aria-selected={t.logicalName === props.selected}
                            className={`mi-picker-option ${index === active ? 'mi-picker-active' : ''} ${t.logicalName === props.selected ? 'mi-picker-selected' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => choose(t)}
                        >
                            <span className="mi-picker-display">{t.displayName}</span>
                            <span className="mi-picker-logical">{t.logicalName}</span>
                        </div>
                    ))}
                    {filtered.length > MaxVisible && <div className="mi-picker-empty">{strings.refineSearch(filtered.length - MaxVisible)}</div>}
                </div>
            )}
        </div>
    );
}
