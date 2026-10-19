import type { AttributeInfo, DvRecord, LookupValue } from '../models/types';
import type { Strings } from '../i18n/strings';

/**
 * Human-readable formatting and comparison of Web API attribute values (port of Helpers/ValueHelper.cs).
 */

export const FormattedValue = '@OData.Community.Display.V1.FormattedValue';
export const LookupLogicalName = '@Microsoft.Dynamics.CRM.lookuplogicalname';

const LookupTypes = new Set(['Lookup', 'Customer', 'Owner']);

export const isLookup = (attribute: AttributeInfo) => LookupTypes.has(attribute.attributeType);

/** Web API key of a lookup value: _name_value. */
export const lookupKey = (name: string) => `_${name}_value`;

/**
 * Readable value of a column: name for lookups, formatted value for choices, money, dates, booleans…
 * `key` may be "alias.attribute" for a column of a linked table.
 */
export function formatValue(record: DvRecord | null | undefined, key: string, strings: Strings): string {
    if (!record) return '';

    const lookup = lookupKey(key);
    if (lookup in record) {
        const id = record[lookup];
        if (id === null || id === undefined) return '';
        const name = record[lookup + FormattedValue];
        return typeof name === 'string' && name.length > 0 ? name : String(id);
    }

    const formatted = record[key + FormattedValue];
    if (typeof formatted === 'string') return formatted;

    return formatRaw(record[key], strings);
}

function formatRaw(value: unknown, strings: Strings): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? strings.yes : strings.no;
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Raw value of an attribute: LookupValue for lookups, the JSON value otherwise (null when absent). */
export function getRawValue(record: DvRecord, attribute: AttributeInfo): unknown {
    if (isLookup(attribute)) {
        const key = lookupKey(attribute.logicalName);
        const id = record[key];
        if (id === null || id === undefined) return null;
        const lookupValue: LookupValue = {
            id: String(id).toLowerCase(),
            entity: String(record[key + LookupLogicalName] ?? ''),
            name: record[key + FormattedValue] as string | undefined,
        };
        return lookupValue;
    }
    const value = record[attribute.logicalName];
    return value === undefined ? null : value;
}

/** A value is empty if it is absent, null or an empty string. */
export function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === 'string' && value.length === 0);
}

const isLookupValue = (value: unknown): value is LookupValue => typeof value === 'object' && value !== null && 'id' in value && 'entity' in value;

/** Compares two raw values (null and empty are equivalent). */
export function areEqual(a: unknown, b: unknown): boolean {
    if (isEmpty(a) && isEmpty(b)) return true;
    if (isEmpty(a) || isEmpty(b)) return false;

    if (isLookupValue(a) && isLookupValue(b)) {
        return a.id === b.id && a.entity.toLowerCase() === b.entity.toLowerCase();
    }
    if (typeof a === 'object' || typeof b === 'object') {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return a === b;
}

/** Normalized GUID (lower case, no braces). */
export const normalizeId = (id: unknown) => String(id ?? '').replace(/[{}]/g, '').toLowerCase();
