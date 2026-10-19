import type { DvRecord } from '../models/types';

/**
 * Thin helpers over window.dataverseAPI (Web API): OData GET, FetchXML with annotations and paging, $batch.
 */

const api = () => window.dataverseAPI;

/** Maximum number of operations in a $batch / changeset. */
export const MaxBatchSize = 1000;

/**
 * Relative Web API GET (e.g. "EntityDefinitions(LogicalName='account')/Attributes").
 * The ToolBox already sends Prefer: odata.include-annotations="*"; passing extra headers would trigger a consent prompt.
 */
export async function getJson<T = any>(path: string): Promise<T> {
    return (await api().queryData(path)) as T;
}

export interface FetchPage {
    records: DvRecord[];
    moreRecords: boolean;
    pagingCookie?: string;
}

/**
 * Runs one FetchXML page with formatted values and lookup annotations.
 * Uses queryData on the real entity set name: fetchXmlQuery guesses it by pluralizing the logical name.
 */
export async function fetchPage(fetchXml: string, entitySetName: string): Promise<FetchPage> {
    const result = (await getJson(`${entitySetName}?fetchXml=${encodeURIComponent(fetchXml)}`)) as Record<string, any>;
    const records = (result.value ?? []) as DvRecord[];
    const cookieAnnotation = result['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'] as string | undefined;
    const moreFlag = result['@Microsoft.Dynamics.CRM.morerecords'];
    return {
        records,
        moreRecords: typeof moreFlag === 'boolean' ? moreFlag : cookieAnnotation !== undefined,
        pagingCookie: extractPagingCookie(cookieAnnotation),
    };
}

/**
 * The Web API returns the paging cookie wrapped in a <cookie pagingcookie="..."> element, double URL-encoded.
 */
function extractPagingCookie(annotation: string | undefined): string | undefined {
    if (!annotation) return undefined;
    try {
        const doc = new DOMParser().parseFromString(annotation, 'text/xml');
        const encoded = doc.documentElement.getAttribute('pagingcookie');
        if (!encoded) return undefined;
        return decodeURIComponent(decodeURIComponent(encoded));
    } catch {
        return undefined;
    }
}

/**
 * FetchXML paging (page + paging cookie) up to the requested limit.
 */
export async function fetchAllPages(fetchXml: string, entitySetName: string, max: number, progress?: (count: number) => void): Promise<{ records: DvRecord[]; truncated: boolean }> {
    const doc = parseXml(fetchXml);
    const root = doc.documentElement;
    const pageSize = 5000;
    max = Math.max(1, max);

    const records: DvRecord[] = [];
    let truncated = false;
    let page = 1;
    let cookie: string | undefined;

    root.setAttribute('count', String(Math.min(pageSize, max)));

    for (;;) {
        root.setAttribute('page', String(page));
        if (cookie) root.setAttribute('paging-cookie', cookie);
        else root.removeAttribute('paging-cookie');

        const response = await fetchPage(serializeXml(doc), entitySetName);

        for (const record of response.records) {
            if (records.length >= max) {
                truncated = true;
                break;
            }
            records.push(record);
        }

        progress?.(records.length);

        // Without the morerecords annotation, a full page means there may be more.
        const more = response.moreRecords && response.records.length > 0 && response.records.length >= Math.min(pageSize, max);
        if (records.length >= max) {
            truncated = truncated || more;
            break;
        }
        if (!more) break;

        page++;
        cookie = response.pagingCookie;
    }

    return { records, truncated };
}

export async function executeTransaction(requests: DataverseAPI.BatchRequest[]) {
    return api().executeTransaction(requests);
}

export async function execute(request: DataverseAPI.ExecuteRequest) {
    return api().execute(request);
}

/** Body of a $batch response (string or already parsed JSON). */
export function batchBody<T = any>(result: DataverseAPI.BatchResult): T | undefined {
    if (typeof result.body === 'string') {
        try {
            return JSON.parse(result.body) as T;
        } catch {
            return undefined;
        }
    }
    return result.body as T | undefined;
}

export function batchError(result: DataverseAPI.BatchResult): string {
    const body = batchBody<any>(result);
    return body?.error?.message ?? result.statusText ?? `HTTP ${result.status}`;
}

/** Localized label of a metadata Label. */
export function labelOf(label: any, fallback: string): string {
    return label?.UserLocalizedLabel?.Label ?? label?.LocalizedLabels?.[0]?.Label ?? fallback;
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

/** Runs an async action on every item with at most `limit` actions in flight. */
export async function mapLimit<T>(items: T[], limit: number, action: (item: T, index: number) => Promise<void>): Promise<void> {
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            await action(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function chunk<T>(source: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < source.length; i += size) chunks.push(source.slice(i, i + size));
    return chunks;
}

export function escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function parseXml(xml: string): XMLDocument {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Invalid XML');
    return doc;
}

export function serializeXml(doc: XMLDocument): string {
    return new XMLSerializer().serializeToString(doc);
}

/** Single-quoted OData string literal. */
export const odataString = (value: string) => `'${value.replace(/'/g, "''")}'`;
