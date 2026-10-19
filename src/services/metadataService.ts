import type { Strings } from '../i18n/strings';
import type { AttributeInfo, EntityDetails, EntityInfo, ManyToOneInfo, OneToManyInfo, StateInfo, ViewItem } from '../models/types';
import { escapeXml, execute, fetchAllPages, fetchPage, getJson, labelOf, odataString } from './dataverse';

/**
 * Metadata access: tables, attributes, relationships, views and statuses (port of Services/MetadataService.cs).
 */

const entityPath = (logicalName: string) => `EntityDefinitions(LogicalName=${odataString(logicalName)})`;

export interface TablesResult {
    /** Tables offered for merging, sorted by display name. */
    mergeable: EntityInfo[];
    /** Every table of the environment, by logical name (entity set names, primary keys of child tables…). */
    all: Map<string, EntityInfo>;
    warnings: string[];
}

/**
 * Tables offered for merging: valid for Advanced Find, customizable, with statecode, neither intersect nor virtual.
 * If onlyReadWrite is true, only tables on which the current user has the Read AND Write privileges
 * (through their roles or their teams' roles) are returned.
 */
export async function getTables(onlyReadWrite: boolean, strings: Strings): Promise<TablesResult> {
    const warnings: string[] = [];

    const [response, entitiesWithState] = await Promise.all([
        window.dataverseAPI.getAllEntitiesMetadata([
            'LogicalName',
            'DisplayName',
            'EntitySetName',
            'PrimaryIdAttribute',
            'PrimaryNameAttribute',
            'ObjectTypeCode',
            'IsValidForAdvancedFind',
            'IsCustomizable',
            'IsIntersect',
            'DataProviderId',
            'Privileges',
        ]),
        getEntitiesWithStateCode(),
    ]);

    let granted: Set<string> | null = null;
    if (onlyReadWrite) {
        try {
            granted = await getCurrentUserPrivilegeIds();
        } catch (error) {
            // Without the privileges, better show every table than an empty list.
            warnings.push(strings.privilegeCheckFailed(error instanceof Error ? error.message : String(error)));
        }
    }

    const all = new Map<string, EntityInfo>();
    let mergeable: EntityInfo[] = [];
    const unfiltered: EntityInfo[] = [];

    for (const e of response.value as any[]) {
        const info: EntityInfo = {
            logicalName: e.LogicalName,
            displayName: labelOf(e.DisplayName, e.LogicalName),
            entitySetName: e.EntitySetName,
            primaryIdAttribute: e.PrimaryIdAttribute,
            primaryNameAttribute: e.PrimaryNameAttribute ?? undefined,
            objectTypeCode: e.ObjectTypeCode,
        };
        all.set(info.logicalName, info);

        if (e.IsValidForAdvancedFind !== true) continue;
        if (e.IsCustomizable?.Value !== true) continue;
        if (e.IsIntersect === true) continue;
        if (isVirtual(e)) continue;
        if (entitiesWithState && !entitiesWithState.has(e.LogicalName)) continue;
        unfiltered.push(info);
        if (granted && !canReadAndWrite(e, granted)) continue;
        mergeable.push(info);
    }

    // Privileges unreadable (empty role privileges or metadata without Privileges): better show every table than an empty list.
    if (granted && mergeable.length === 0 && unfiltered.length > 0) {
        warnings.push(strings.privilegeCheckFailed(strings.noReadWriteTable));
        mergeable = unfiltered;
    }

    mergeable.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }) || a.logicalName.localeCompare(b.logicalName));
    return { mergeable, all, warnings };
}

/** A virtual table has an external data provider. */
function isVirtual(entity: any): boolean {
    return !!entity.DataProviderId && entity.DataProviderId !== '00000000-0000-0000-0000-000000000000';
}

/** True if the user has the table's Read and Write privileges (whatever the depth). */
function canReadAndWrite(entity: any, granted: Set<string>): boolean {
    const privileges = (entity.Privileges ?? []) as any[];
    const read = privileges.find((p) => p.PrivilegeType === 'Read');
    const write = privileges.find((p) => p.PrivilegeType === 'Write');
    return !!read && !!write && granted.has(String(read.PrivilegeId).toLowerCase()) && granted.has(String(write.PrivilegeId).toLowerCase());
}

/**
 * Privileges of the current user: those of their roles and those of the roles of the teams they belong to.
 */
async function getCurrentUserPrivilegeIds(): Promise<Set<string>> {
    const whoAmI = await execute({ operationName: 'WhoAmI', operationType: 'function' });
    const userId = String(whoAmI.UserId);
    const granted = new Set<string>();

    const userPrivileges = await execute({ entityName: 'systemuser', entityId: userId, operationName: 'RetrieveUserPrivileges', operationType: 'function' });
    for (const privilege of (userPrivileges.RolePrivileges ?? []) as any[]) {
        granted.add(String(privilege.PrivilegeId).toLowerCase());
    }

    const teams = await fetchPage(
        `<fetch><entity name="teammembership"><attribute name="teamid" /><filter><condition attribute="systemuserid" operator="eq" value="${escapeXml(userId)}" /></filter></entity></fetch>`,
        'teammemberships',
    );
    for (const membership of teams.records) {
        try {
            const teamPrivileges = await execute({ entityName: 'team', entityId: String(membership.teamid), operationName: 'RetrieveTeamPrivileges', operationType: 'function' });
            for (const privilege of (teamPrivileges.RolePrivileges ?? []) as any[]) {
                granted.add(String(privilege.PrivilegeId).toLowerCase());
            }
        } catch {
            // Team without role or unreadable: ignored.
        }
    }

    return granted;
}

/**
 * Tables that have a "statecode" attribute (null when the metadata query fails: the list is then not filtered).
 */
async function getEntitiesWithStateCode(): Promise<Set<string> | null> {
    try {
        const response = await getJson<{ value: any[] }>(
            "EntityDefinitions?$select=LogicalName&$expand=Attributes($select=LogicalName;$filter=LogicalName eq 'statecode')",
        );
        return new Set(response.value.filter((e) => (e.Attributes ?? []).some((a: any) => a.LogicalName === 'statecode')).map((e) => e.LogicalName as string));
    } catch {
        return null;
    }
}

/**
 * Full metadata of a table: attributes, N:1 and 1:N relationships, default inactive status.
 */
export async function getEntityDetails(logicalName: string, strings: Strings): Promise<EntityDetails> {
    const path = entityPath(logicalName);
    const [entity, attributes, manyToOne, oneToMany, state] = await Promise.all([
        window.dataverseAPI.getEntityMetadata(logicalName, true, ['LogicalName', 'DisplayName', 'EntitySetName', 'PrimaryIdAttribute', 'PrimaryNameAttribute', 'ObjectTypeCode']),
        getJson<{ value: any[] }>(`${path}/Attributes`),
        getJson<{ value: any[] }>(`${path}/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName`),
        getJson<{ value: any[] }>(`${path}/OneToManyRelationships?$select=SchemaName,ReferencedAttribute,ReferencingEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName`),
        getDefaultInactiveStatus(logicalName, strings).then(
            (value) => ({ value, error: undefined as string | undefined }),
            (error: unknown) => ({ value: null, error: error instanceof Error ? error.message : String(error) }),
        ),
    ]);

    const e = entity as any;
    return {
        logicalName: e.LogicalName,
        displayName: labelOf(e.DisplayName, e.LogicalName),
        entitySetName: e.EntitySetName,
        primaryIdAttribute: e.PrimaryIdAttribute,
        primaryNameAttribute: e.PrimaryNameAttribute ?? undefined,
        objectTypeCode: e.ObjectTypeCode,
        attributes: attributes.value.map(toAttributeInfo),
        manyToOne: manyToOne.value.map(
            (r): ManyToOneInfo => ({
                referencingAttribute: r.ReferencingAttribute,
                referencedEntity: r.ReferencedEntity,
                navigationProperty: r.ReferencingEntityNavigationPropertyName,
            }),
        ),
        oneToMany: oneToMany.value.map(
            (r): OneToManyInfo => ({
                schemaName: r.SchemaName,
                referencedAttribute: r.ReferencedAttribute,
                referencingEntity: r.ReferencingEntity,
                referencingAttribute: r.ReferencingAttribute,
                navigationProperty: r.ReferencingEntityNavigationPropertyName,
            }),
        ),
        state: state.value,
        stateError: state.error,
    };
}

function toAttributeInfo(a: any): AttributeInfo {
    return {
        logicalName: a.LogicalName,
        displayName: labelOf(a.DisplayName, a.LogicalName),
        attributeType: a.AttributeType,
        attributeTypeName: a.AttributeTypeName?.Value,
        isCustomizable: a.IsCustomizable?.Value === true,
        isValidForUpdate: a.IsValidForUpdate === true,
        isValidForRead: a.IsValidForRead === true,
        attributeOf: a.AttributeOf ?? null,
        sourceType: a.SourceType ?? null,
    };
}

/**
 * Default inactive status: statecode option 1 and its DefaultStatus (statecode attribute metadata).
 */
async function getDefaultInactiveStatus(logicalName: string, strings: Strings): Promise<StateInfo> {
    const path = entityPath(logicalName);
    const [stateResponse, statusResponse] = await Promise.all([
        getJson<{ value: any[] }>(`${path}/Attributes/Microsoft.Dynamics.CRM.StateAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`),
        getJson<{ value: any[] }>(`${path}/Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`),
    ]);

    const stateAttribute = stateResponse.value[0];
    if (!stateAttribute) throw new Error(strings.errNoStateCode(logicalName));

    const inactiveOption = ((stateAttribute.OptionSet?.Options ?? []) as any[]).find((o) => o.Value === 1);
    if (!inactiveOption) throw new Error(strings.errNoInactiveState(logicalName));

    const status = inactiveOption.DefaultStatus as number | null | undefined;
    if (status === null || status === undefined) throw new Error(strings.errNoDefaultStatus(logicalName));

    const statusOption = ((statusResponse.value[0]?.OptionSet?.Options ?? []) as any[]).find((o) => o.Value === status);
    return {
        inactiveState: 1,
        inactiveStatus: status,
        inactiveStatusLabel: labelOf(statusOption?.Label, String(status)),
    };
}

/**
 * Active public system views (savedquery) and personal views (userquery) of the table.
 */
export async function getViews(objectTypeCode: number | undefined): Promise<ViewItem[]> {
    // returnedtypecode only accepts the numeric object type code through the Web API.
    if (typeof objectTypeCode !== 'number') return [];

    const views: ViewItem[] = [...(await retrieveViews('savedquery', objectTypeCode, false))];
    try {
        views.push(...(await retrieveViews('userquery', objectTypeCode, true)));
    } catch {
        // No read privilege on personal views: continue with the system views.
    }

    return views.sort(
        (a, b) => Number(a.isPersonal) - Number(b.isPersonal) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

async function retrieveViews(viewEntity: 'savedquery' | 'userquery', objectTypeCode: number, personal: boolean): Promise<ViewItem[]> {
    const fetch = `<fetch>
  <entity name="${viewEntity}">
    <attribute name="${viewEntity}id" />
    <attribute name="name" />
    <attribute name="fetchxml" />
    <attribute name="layoutxml" />
    ${personal ? '' : '<attribute name="isdefault" />'}
    <filter type="and">
      <condition attribute="returnedtypecode" operator="eq" value="${objectTypeCode}" />
      <condition attribute="querytype" operator="eq" value="0" />
      <condition attribute="statecode" operator="eq" value="0" />
      <condition attribute="fetchxml" operator="not-null" />
    </filter>
  </entity>
</fetch>`;

    const { records } = await fetchAllPages(fetch, viewEntity === 'savedquery' ? 'savedqueries' : 'userqueries', 5000);
    return records.map((e) => ({
        id: String(e[`${viewEntity}id`]),
        name: String(e.name ?? ''),
        fetchXml: String(e.fetchxml ?? ''),
        layoutXml: (e.layoutxml as string | undefined) ?? undefined,
        isPersonal: personal,
        isDefault: !personal && e.isdefault === true,
    }));
}

/** Text attributes that can be used by the server-side search. */
export function getSearchCandidates(entity: EntityDetails): AttributeInfo[] {
    return entity.attributes
        .filter((a) => a.attributeType === 'String' && !a.attributeOf && a.isValidForRead && a.logicalName !== entity.primaryNameAttribute)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}
