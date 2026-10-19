import type { ReactNode } from 'react';
import { Button, Tooltip } from '@fluentui/react-components';
import { ArrowMaximizeRegular, ArrowMinimizeRegular, ArrowSwapRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';

/**
 * Small shared visual pieces (port of UI/Controls: CardPanel, RoleChip, StatTile, empty state).
 */

export function Card(props: { step: number; title: string; subtitle: string; actions?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`mi-card ${props.className ?? ''}`}>
            <header className="mi-card-header">
                <span className="mi-step">{props.step}</span>
                <div className="mi-card-titles">
                    <h2>{props.title}</h2>
                    <p>{props.subtitle}</p>
                </div>
                {props.actions && <div className="mi-card-actions">{props.actions}</div>}
            </header>
            <div className="mi-card-body">{props.children}</div>
        </section>
    );
}

export function RoleChip(props: { role: 'master' | 'slave'; caption: string; name?: string | null; placeholder: string }) {
    return (
        <div className={`mi-chip mi-chip-${props.role}`} title={props.name ?? undefined}>
            <span className="mi-chip-caption">{props.caption}</span>
            <span className={props.name ? 'mi-chip-name' : 'mi-chip-name mi-chip-placeholder'}>{props.name ?? props.placeholder}</span>
        </div>
    );
}

export function RolePill(props: { role: 'master' | 'slave'; label: string }) {
    return <span className={`mi-pill mi-pill-${props.role}`}>{props.label}</span>;
}

export function StatTile(props: { caption: string; value: string; tint: 'accent' | 'diff' | 'success' | 'teal' }) {
    return (
        <div className={`mi-stat mi-stat-${props.tint}`}>
            <span className="mi-stat-value">{props.value}</span>
            <span className="mi-stat-caption">{props.caption}</span>
        </div>
    );
}

/** Expands a card to the whole working area, or restores the normal layout. */
export function ExpandToggle(props: { expanded: boolean; onToggle: () => void }) {
    const strings = useStrings();
    const label = props.expanded ? strings.restore : strings.expand;
    return (
        <Tooltip content={label} relationship="label">
            <Button
                className="mi-card-toggle"
                appearance="subtle"
                icon={props.expanded ? <ArrowMinimizeRegular /> : <ArrowMaximizeRegular />}
                aria-pressed={props.expanded}
                onClick={props.onToggle}
            >
                {label}
            </Button>
        </Tooltip>
    );
}

export function EmptyState(props: { text: string }) {
    return (
        <div className="mi-empty">
            <ArrowSwapRegular fontSize={28} />
            <span>{props.text}</span>
        </div>
    );
}
