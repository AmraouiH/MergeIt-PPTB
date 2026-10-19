import { isMergeable, OwnerAttribute } from '../helpers/attributeFilter';
import { areEqual, formatValue, getRawValue, isEmpty, isLookup } from '../helpers/valueHelper';
import type { Strings } from '../i18n/strings';
import type {
    ChildRelationshipInfo,
    ComparisonRow,
    DvRecord,
    EntityDetails,
    EntityInfo,
    LookupValue,
    MergeMode,
    MergePlan,
    PluginSettings,
    RecordRef,
} from '../models/types';
import { willChange } from '../models/types';
import { batchError, chunk, errorMessage, escapeXml, execute, executeTransaction, fetchAllPages, getJson, mapLimit, MaxBatchSize, odataString } from './dataverse';

/**
 * Merge logic: comparison, plan, then execution (transaction or native Merge action) (port of Services/MergeService.cs).
 */

/** Maximum number of operations in a transaction ($batch changeset). */
export const MaxTransactionSize = MaxBatchSize;

/** Tables for which Dataverse offers the native Merge message. */
export const NativeMergeEntities = ['account', 'contact', 'lead', 'incident'];

/**
 * Child tables never reassigned: system tables, tables that cannot be updated directly
 * or whose reassignment would be wrong (e.g. customeraddress, specific to each record).
 */
const ExcludedChildEntities = new Set([
    'activitypointer',
    'activityparty',
    'asyncoperation',
    'bulkdeletefailure',
    'customeraddress',
    'duplicaterecord',
    'mailboxtrackingfolder',
    'post',
    'postfollow',
    'postregarding',
    'postrole',
    'principalobjectaccess',
    'principalobjectattributeaccess',
    'processsession',
    'slakpiinstance',
    'syncerror',
    'userentityinstancedata',
    'userentityuisettings',
    'workflowlog',
]);

/** Parallel read requests when counting child records. */
const RequestConcurrency = 8;

/** Relationship attributes never reassigned (masterid is handled by the native merge). */
const ExcludedChildAttributes = new Set(['masterid']);

export class MergeError extends Error {}

export const supportsNativeMerge = (entityName: string | undefined) => !!entityName && NativeMergeEntities.includes(entityName);

// #region Comparison

/**
 * Builds the comparison rows for the mergeable attributes.
 * previousChoices: existing choices (logical name → useSlave) kept when rebuilding.
 */
export function buildComparison(
    entity: EntityDetails,
    master: DvRecord,
    slave: DvRecord,
    settings: PluginSettings,
    includeOwner: boolean,
    strings: Strings,
    previousChoices?: Map<string, boolean>,
): ComparisonRow[] {
    const rows: ComparisonRow[] = [];

    for (const attribute of entity.attributes.filter((a) => isMergeable(a, entity, settings, includeOwner))) {
        const name = attribute.logicalName;
        const masterValue = getRawValue(master, attribute);
        const slaveValue = getRawValue(slave, attribute);
        const masterEmpty = isEmpty(masterValue);
        const slaveEmpty = isEmpty(slaveValue);

        const previous = previousChoices?.get(name);
        rows.push({
            attribute,
            logicalName: name,
            displayName: attribute.displayName,
            masterValue,
            slaveValue,
            masterDisplay: formatValue(master, name, strings),
            slaveDisplay: formatValue(slave, name, strings),
            masterEmpty,
            slaveEmpty,
            areEqual: areEqual(masterValue, slaveValue),
            bothEmpty: masterEmpty && slaveEmpty,
            // Master by default; smart rule: Slave when the Master is empty and the Slave is filled.
            useSlave: previous !== undefined ? previous : settings.smartSlaveDefault && masterEmpty && !slaveEmpty,
        });
    }

    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }) || a.logicalName.localeCompare(b.logicalName));
}

// #endregion

// #region Plan

/**
 * Builds the merge plan: Web API update body limited to the fields where the Slave value is kept and differs.
 */
export function buildPlan(
    entity: EntityDetails,
    tables: Map<string, EntityInfo>,
    master: RecordRef,
    slave: RecordRef,
    rows: ComparisonRow[],
    mode: MergeMode,
    relationshipsToReassign: ChildRelationshipInfo[],
    strings: Strings,
): MergePlan {
    const plan: MergePlan = {
        entityName: entity.logicalName,
        entityDisplayName: entity.displayName,
        entitySetName: entity.entitySetName,
        primaryIdAttribute: entity.primaryIdAttribute,
        masterId: master.id,
        masterName: master.name,
        slaveId: slave.id,
        slaveName: slave.name,
        mode,
        masterUpdate: {},
        changes: [],
        inactiveState: 1,
        inactiveStatus: 0,
        inactiveStatusLabel: '',
        relationshipsToReassign: [],
    };

    for (const row of rows.filter(willChange)) {
        // An empty Slave value clears the field on the Master.
        Object.assign(plan.masterUpdate, toWebApiField(entity, tables, row, strings));
        plan.changes.push({ logicalName: row.logicalName, displayName: row.displayName, oldValue: row.masterDisplay, newValue: row.slaveDisplay });
    }

    if (mode === 'manual') {
        if (!entity.state) throw new Error(entity.stateError ?? strings.errNoStateCode(entity.logicalName));
        plan.inactiveState = entity.state.inactiveState;
        plan.inactiveStatus = entity.state.inactiveStatus;
        plan.inactiveStatusLabel = entity.state.inactiveStatusLabel;
        plan.relationshipsToReassign = relationshipsToReassign.filter((r) => r.count > 0);
    }

    return plan;
}

/**
 * Web API representation of the Slave value: plain property, or "navigation@odata.bind" for a lookup.
 */
function toWebApiField(entity: EntityDetails, tables: Map<string, EntityInfo>, row: ComparisonRow, strings: Strings): Record<string, unknown> {
    if (!isLookup(row.attribute)) {
        return { [row.logicalName]: row.slaveEmpty ? null : row.slaveValue };
    }

    const slaveValue = row.slaveEmpty ? null : (row.slaveValue as LookupValue);
    const masterValue = row.masterEmpty ? null : (row.masterValue as LookupValue);
    // For a polymorphic lookup (customer, owner…) the navigation property depends on the target table;
    // when clearing, use the table currently referenced by the Master.
    const targetEntity = slaveValue?.entity ?? masterValue?.entity;

    let navigation: string | undefined;
    if (row.logicalName === OwnerAttribute) {
        navigation = OwnerAttribute;
    } else {
        const candidates = entity.manyToOne.filter((r) => r.referencingAttribute === row.logicalName);
        navigation = (candidates.find((r) => r.referencedEntity === targetEntity) ?? (candidates.length === 1 ? candidates[0] : undefined))?.navigationProperty;
    }
    if (!navigation) throw new Error(strings.errNoNavigationProperty(row.logicalName));

    if (!slaveValue) return { [`${navigation}@odata.bind`]: null };

    const setName = tables.get(slaveValue.entity)?.entitySetName;
    if (!setName) throw new Error(strings.errNoNavigationProperty(row.logicalName));
    return { [`${navigation}@odata.bind`]: `/${setName}(${slaveValue.id})` };
}

// #endregion

// #region Child relationships

/**
 * Lists the 1:N relationships of the table and counts the Slave's children for each one (only those with children are returned).
 */
export async function countChildRecords(
    entity: EntityDetails,
    tables: Map<string, EntityInfo>,
    masterId: string,
    slaveId: string,
    strings: Strings,
    warnings: string[],
): Promise<ChildRelationshipInfo[]> {
    const seen = new Set<string>();
    const candidates = entity.oneToMany
        .filter((r) => r.referencedAttribute === entity.primaryIdAttribute)
        .filter((r) => !ExcludedChildEntities.has(r.referencingEntity))
        .filter((r) => !(r.referencingEntity === entity.logicalName && ExcludedChildAttributes.has(r.referencingAttribute)))
        .filter((r) => {
            const key = `${r.referencingEntity}|${r.referencingAttribute}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    if (candidates.length === 0) return [];

    // Independent requests (not a $batch): without "Prefer: odata.continue-on-error", which the tool cannot send
    // without a consent prompt, Dataverse stops a batch at the first failure and the ToolBox rejects the whole response.
    // Here a failing relationship is skipped and the others are still processed.

    // Checks that the lookup attributes can be updated (an unreadable attribute skips the relationship).
    const updatable = new Set<string>();
    await mapLimit(candidates, RequestConcurrency, async (r) => {
        try {
            const attribute = await getJson<{ IsValidForUpdate?: boolean }>(
                `EntityDefinitions(LogicalName=${odataString(r.referencingEntity)})/Attributes(LogicalName=${odataString(r.referencingAttribute)})?$select=IsValidForUpdate`,
            );
            if (attribute?.IsValidForUpdate === true) updatable.add(`${r.referencingEntity}|${r.referencingAttribute}`);
        } catch (error) {
            warnings.push(strings.countFailed(r.schemaName, errorMessage(error)));
        }
    });

    const relationships: ChildRelationshipInfo[] = [];
    for (const relationship of candidates) {
        const child = tables.get(relationship.referencingEntity);
        if (!child?.primaryIdAttribute || !child.entitySetName || !relationship.navigationProperty) continue;
        if (!updatable.has(`${relationship.referencingEntity}|${relationship.referencingAttribute}`)) continue;

        relationships.push({
            schemaName: relationship.schemaName,
            referencingEntity: relationship.referencingEntity,
            referencingEntityDisplayName: child.displayName,
            referencingEntitySetName: child.entitySetName,
            referencingAttribute: relationship.referencingAttribute,
            referencingEntityPrimaryId: child.primaryIdAttribute,
            navigationProperty: relationship.navigationProperty,
            count: 0,
        });
    }

    // Counts: a relationship whose count fails (e.g. a table without aggregate support) is skipped.
    await mapLimit(relationships, RequestConcurrency, async (relationship) => {
        try {
            const result = await getJson<{ value?: Array<Record<string, unknown>> }>(
                `${relationship.referencingEntitySetName}?fetchXml=${encodeURIComponent(buildCountFetch(entity, relationship, masterId, slaveId))}`,
            );
            const count = result?.value?.[0]?.cnt;
            relationship.count = typeof count === 'number' ? count : Number(count ?? 0) || 0;
        } catch (error) {
            warnings.push(strings.countFailed(relationship.schemaName, errorMessage(error)));
            relationship.count = -1;
        }
    });

    return relationships
        .filter((r) => r.count > 0)
        .sort((a, b) => a.referencingEntityDisplayName.localeCompare(b.referencingEntityDisplayName, undefined, { sensitivity: 'base' }));
}

function childFilter(entityName: string, relationship: ChildRelationshipInfo, masterId: string, slaveId: string): string {
    let filter = `<condition attribute="${escapeXml(relationship.referencingAttribute)}" operator="eq" value="${escapeXml(slaveId)}" />`;
    // Self-referencing relationship: the Master and the Slave themselves are not "children".
    if (relationship.referencingEntity === entityName) {
        filter += `<condition attribute="${escapeXml(relationship.referencingEntityPrimaryId)}" operator="ne" value="${escapeXml(masterId)}" />`;
        filter += `<condition attribute="${escapeXml(relationship.referencingEntityPrimaryId)}" operator="ne" value="${escapeXml(slaveId)}" />`;
    }
    return `<filter type="and">${filter}</filter>`;
}

function buildCountFetch(entity: EntityDetails, relationship: ChildRelationshipInfo, masterId: string, slaveId: string): string {
    return (
        `<fetch aggregate="true"><entity name="${escapeXml(relationship.referencingEntity)}">` +
        `<attribute name="${escapeXml(relationship.referencingEntityPrimaryId)}" alias="cnt" aggregate="count" />` +
        childFilter(entity.logicalName, relationship, masterId, slaveId) +
        `</entity></fetch>`
    );
}

/** Ids of the Slave's children for a relationship (paged). */
async function retrieveChildIds(plan: MergePlan, relationship: ChildRelationshipInfo): Promise<string[]> {
    const fetch =
        `<fetch><entity name="${escapeXml(relationship.referencingEntity)}">` +
        `<attribute name="${escapeXml(relationship.referencingEntityPrimaryId)}" />` +
        childFilter(plan.entityName, relationship, plan.masterId, plan.slaveId) +
        `</entity></fetch>`;
    const { records } = await fetchAllPages(fetch, relationship.referencingEntitySetName, Number.MAX_SAFE_INTEGER);
    return records.map((r) => String(r[relationship.referencingEntityPrimaryId]));
}

// #endregion

// #region Execution

/** Runs the merge according to the plan's mode. */
export async function executeMerge(plan: MergePlan, strings: Strings, progress: (message: string) => void): Promise<void> {
    if (plan.mode === 'native') {
        await executeNativeMerge(plan, strings, progress);
    } else {
        await executeManualMerge(plan, strings, progress);
    }
}

/**
 * Native Merge action: Dataverse updates the Master (UpdateContent), reassigns the children and deactivates the Slave.
 */
async function executeNativeMerge(plan: MergePlan, strings: Strings, progress: (message: string) => void) {
    progress(strings.progressNativeMerge);

    const odataType = `Microsoft.Dynamics.CRM.${plan.entityName}`;
    try {
        await execute({
            operationName: 'Merge',
            operationType: 'action',
            parameters: {
                Target: { '@odata.type': odataType, [plan.primaryIdAttribute]: plan.masterId },
                Subordinate: { '@odata.type': odataType, [plan.primaryIdAttribute]: plan.slaveId },
                UpdateContent: { '@odata.type': odataType, ...plan.masterUpdate },
                PerformParentingChecks: false,
            },
        });
    } catch (error) {
        throw new MergeError(strings.nativeMergeFailed(errorMessage(error)));
    }
}

interface Operation {
    request: DataverseAPI.BatchRequest;
    description: string;
}

/**
 * Manual mode: optional reassignment of the children, Master update and Slave deactivation
 * in a transaction (all or nothing).
 */
async function executeManualMerge(plan: MergePlan, strings: Strings, progress: (message: string) => void) {
    const operations: Operation[] = [];

    for (const relationship of plan.relationshipsToReassign) {
        progress(strings.progressChildLookup(relationship.referencingEntityDisplayName));
        for (const childId of await retrieveChildIds(plan, relationship)) {
            operations.push({
                request: {
                    method: 'PATCH',
                    url: `${relationship.referencingEntitySetName}(${childId})`,
                    body: { [`${relationship.navigationProperty}@odata.bind`]: `/${plan.entitySetName}(${plan.masterId})` },
                },
                description: strings.opReassign(relationship.referencingEntity, childId, relationship.referencingAttribute),
            });
        }
    }

    if (Object.keys(plan.masterUpdate).length > 0) {
        operations.push({
            request: { method: 'PATCH', url: `${plan.entitySetName}(${plan.masterId})`, body: plan.masterUpdate },
            description: strings.opUpdateMaster(plan.masterName),
        });
    }

    operations.push({
        request: { method: 'PATCH', url: `${plan.entitySetName}(${plan.slaveId})`, body: { statecode: plan.inactiveState, statuscode: plan.inactiveStatus } },
        description: strings.opDeactivateSlave(plan.slaveName),
    });

    // Beyond 1000 operations, several transactions are needed: reassignments go first,
    // the last transaction always contains the Master update and the Slave deactivation.
    const batches = chunk(operations, MaxTransactionSize);
    for (let i = 0; i < batches.length; i++) {
        progress(batches.length === 1 ? strings.progressTransaction(operations.length) : strings.progressTransactionBatch(i + 1, batches.length));
        await runTransaction(batches[i], i, batches.length, strings);
    }
}

async function runTransaction(operations: Operation[], batchIndex: number, batchCount: number, strings: Strings) {
    const requests = operations.map((o, index) => ({ ...o.request, contentId: String(index + 1) }));

    let message: string | null = null;
    let failedIndex = -1;
    try {
        const results = await executeTransaction(requests);
        const failed = results.findIndex((r) => r.status >= 400);
        if (failed >= 0) {
            message = batchError(results[failed]);
            // A failed changeset usually returns only the failing operation: its Content-ID identifies it.
            const contentId = Number(results[failed].contentId);
            failedIndex = Number.isInteger(contentId) && contentId > 0 ? contentId - 1 : results.length === operations.length ? failed : -1;
        }
    } catch (error) {
        message = errorMessage(error);
        const match = /Content-ID:\s*(\d+)/i.exec(message);
        if (match) failedIndex = Number(match[1]) - 1;
    }

    if (message === null) return;

    const failed = failedIndex >= 0 && failedIndex < operations.length ? operations[failedIndex].description : null;
    let text = failed ? strings.failedDuring(failed, message) : strings.transactionFailed(message);
    text += batchIndex === 0 ? strings.rolledBack : strings.partiallyCommitted(batchIndex + 1, batchCount, batchIndex);
    throw new MergeError(text);
}

// #endregion
