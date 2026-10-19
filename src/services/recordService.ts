import type { Strings } from '../i18n/strings';
import type { DvRecord, EntityDetails, GridColumn, RecordLoadResult, ViewItem } from '../models/types';
import { escapeXml, fetchAllPages, fetchPage, parseXml, serializeXml } from './dataverse';

/**
 * Record loading: active records by default, server-side search, view execution. FetchXML paging
 * (port of Services/RecordService.cs).
 */

/** Key columns displayed by default for some common tables (in addition to the primary name). */
const KeyColumns: Record<string, string[]> = {
    account: ['accountnumber', 'emailaddress1', 'telephone1', 'address1_city', 'primarycontactid'],
    contact: ['emailaddress1', 'telephone1', 'mobilephone', 'parentcustomerid', 'address1_city'],
    lead: ['companyname', 'emailaddress1', 'telephone1'],
    incident: ['ticketnumber', 'customerid', 'prioritycode'],
    opportunity: ['customerid', 'estimatedvalue', 'estimatedclosedate'],
};

/** Columns added to every table when they exist. */
const CommonColumns = ['ownerid', 'createdon', 'modifiedon'];

const stateActiveCondition = '<condition attribute="statecode" operator="eq" value="0" />';

/**
 * Active records, optionally filtered by a text (like '%text%') on the primary name and the search fields.
 */
export async function loadActiveRecords(
    entity: EntityDetails,
    searchText: string | null,
    searchAttributes: string[],
    max: number,
    progress?: (count: number) => void,
): Promise<RecordLoadResult> {
    const columns = getDefaultColumns(entity, searchAttributes);
    const text = searchText?.trim() ?? '';

    let filter = stateActiveCondition;
    if (text.length > 0) {
        const fields = [...new Set([...(entity.primaryNameAttribute ? [entity.primaryNameAttribute] : []), ...searchAttributes])];
        const conditions = fields.map((field) => `<condition attribute="${escapeXml(field)}" operator="like" value="${escapeXml(`%${text}%`)}" />`).join('');
        filter += `<filter type="or">${conditions}</filter>`;
    }

    const fetch =
        `<fetch><entity name="${escapeXml(entity.logicalName)}">` +
        `<attribute name="${escapeXml(entity.primaryIdAttribute)}" />` +
        columns.map((c) => `<attribute name="${escapeXml(c.key)}" />`).join('') +
        (entity.primaryNameAttribute ? `<order attribute="${escapeXml(entity.primaryNameAttribute)}" />` : '') +
        `<filter type="and">${filter}</filter>` +
        `</entity></fetch>`;

    const { records, truncated } = await fetchAllPages(fetch, entity.entitySetName, max, progress);
    return {
        records,
        columns,
        truncated,
        sourceKind: text.length > 0 ? 'search' : 'active',
        sourceName: text.length > 0 ? text : undefined,
    };
}

/**
 * Runs the FetchXML of a view (restricted to active records), with paging.
 * Grid columns follow the view's layoutxml when possible.
 */
export async function executeView(entity: EntityDetails, view: ViewItem, max: number, strings: Strings, progress?: (count: number) => void): Promise<RecordLoadResult> {
    let doc: XMLDocument;
    try {
        doc = parseXml(view.fetchXml);
    } catch {
        throw new Error(strings.errInvalidFetch);
    }
    const root = doc.documentElement;

    if ((root.getAttribute('aggregate') ?? '').toLowerCase() === 'true') {
        throw new Error(strings.errAggregateView);
    }

    // Paging is handled here: remove the attributes that prevent it.
    for (const attribute of ['top', 'count', 'page', 'paging-cookie']) root.removeAttribute(attribute);

    const entityElement = childElements(root, 'entity')[0];
    if (!entityElement) throw new Error(strings.errInvalidFetchEntity);

    if (childElements(entityElement, 'all-attributes').length === 0) {
        ensureAttribute(doc, entityElement, entity.primaryIdAttribute);
        ensureAttribute(doc, entityElement, entity.primaryNameAttribute);
    }

    // Only active records can be merged.
    const filter = doc.createElement('filter');
    filter.setAttribute('type', 'and');
    const condition = doc.createElement('condition');
    condition.setAttribute('attribute', 'statecode');
    condition.setAttribute('operator', 'eq');
    condition.setAttribute('value', '0');
    filter.appendChild(condition);
    entityElement.appendChild(filter);

    const columns = getViewColumns(entity, view, entityElement);
    const { records, truncated } = await fetchAllPages(serializeXml(doc), entity.entitySetName, max, progress);
    return { records, columns, truncated, sourceKind: 'view', sourceName: view.name };
}

/**
 * Retrieves a record with all its columns (formatted values and lookup annotations included).
 */
export async function retrieveFullRecord(entity: EntityDetails, id: string): Promise<DvRecord | null> {
    const fetch =
        `<fetch><entity name="${escapeXml(entity.logicalName)}"><all-attributes />` +
        `<filter><condition attribute="${escapeXml(entity.primaryIdAttribute)}" operator="eq" value="${escapeXml(id)}" /></filter>` +
        `</entity></fetch>`;
    const page = await fetchPage(fetch, entity.entitySetName);
    return page.records[0] ?? null;
}

/**
 * Primary name + key columns (+ search fields) that exist on the table.
 */
export function getDefaultColumns(entity: EntityDetails, searchAttributes: string[]): GridColumn[] {
    const names: string[] = [];
    if (entity.primaryNameAttribute) names.push(entity.primaryNameAttribute);
    names.push(...(KeyColumns[entity.logicalName] ?? []));
    names.push(...searchAttributes);
    names.push(...CommonColumns);

    const attributes = new Map(entity.attributes.map((a) => [a.logicalName, a]));
    return [...new Set(names)]
        .filter((n) => attributes.get(n)?.isValidForRead === true)
        .map((n) => ({ key: n, header: attributes.get(n)!.displayName }));
}

/**
 * Columns from the view's layoutxml; otherwise, the FetchXML attributes.
 */
function getViewColumns(entity: EntityDetails, view: ViewItem, entityElement: Element): GridColumn[] {
    const attributes = new Map(entity.attributes.map((a) => [a.logicalName, a]));
    const names: string[] = [];

    if (view.layoutXml && view.layoutXml.trim().length > 0) {
        try {
            const layout = parseXml(view.layoutXml);
            for (const cell of Array.from(layout.getElementsByTagName('cell'))) {
                const name = cell.getAttribute('name');
                if (name) names.push(name);
            }
        } catch {
            // Unreadable layoutxml: fall back to the FetchXML.
        }
    }

    if (names.length === 0) {
        for (const attribute of childElements(entityElement, 'attribute')) {
            const name = attribute.getAttribute('name');
            if (name) names.push(name);
        }
    }

    if (entity.primaryNameAttribute && !names.includes(entity.primaryNameAttribute)) {
        names.unshift(entity.primaryNameAttribute);
    }

    const columns: GridColumn[] = [];
    for (const name of new Set(names)) {
        if (name === entity.primaryIdAttribute) continue;
        const attribute = attributes.get(name);
        if (attribute) {
            columns.push({ key: name, header: attribute.displayName });
        } else if (name.includes('.')) {
            // Column of a linked table: "alias.attribute"
            const [alias, attr] = name.split('.');
            columns.push({ key: name, header: `${attr} (${alias})` });
        }
    }
    return columns;
}

function childElements(parent: Element, tagName: string): Element[] {
    return Array.from(parent.children).filter((c) => c.tagName === tagName);
}

function ensureAttribute(doc: XMLDocument, entityElement: Element, attributeName: string | undefined) {
    if (!attributeName) return;
    if (childElements(entityElement, 'attribute').some((a) => a.getAttribute('name') === attributeName)) return;
    const attribute = doc.createElement('attribute');
    attribute.setAttribute('name', attributeName);
    entityElement.insertBefore(attribute, entityElement.firstChild);
}

/** Primary id of a record returned by the Web API. */
export const recordId = (entity: EntityDetails, record: DvRecord) => String(record[entity.primaryIdAttribute] ?? '').toLowerCase();
