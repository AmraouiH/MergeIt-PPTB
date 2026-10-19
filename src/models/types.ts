/**
 * Models of the tool (port of the C# Models folder, adapted to Dataverse Web API payloads).
 */

/** A Dataverse record as returned by the Web API (raw values + OData annotations). */
export type DvRecord = Record<string, unknown>;

/** Value of a lookup column (EntityReference equivalent). */
export interface LookupValue {
    id: string;
    entity: string;
    name?: string;
}

/** Table summary: used for the table list and for entity set / primary key resolution. */
export interface EntityInfo {
    logicalName: string;
    displayName: string;
    entitySetName: string;
    primaryIdAttribute: string;
    primaryNameAttribute?: string;
    objectTypeCode?: number;
}

/** Attribute metadata needed by the comparison and the merge. */
export interface AttributeInfo {
    logicalName: string;
    displayName: string;
    /** AttributeType (String, Lookup, Customer, Owner, Picklist, Virtual, …). */
    attributeType: string;
    /** AttributeTypeName.Value (MultiSelectPicklistType, ImageType, FileType, …). */
    attributeTypeName?: string;
    isCustomizable: boolean;
    isValidForUpdate: boolean;
    isValidForRead: boolean;
    attributeOf?: string | null;
    /** 0 = simple, 1 = calculated, 2 = rollup. */
    sourceType?: number | null;
}

/** N:1 relationship of the merged table: resolves the navigation property used to write a lookup. */
export interface ManyToOneInfo {
    referencingAttribute: string;
    referencedEntity: string;
    navigationProperty: string;
}

/** 1:N relationship of the merged table. */
export interface OneToManyInfo {
    schemaName: string;
    referencedAttribute: string;
    referencingEntity: string;
    referencingAttribute: string;
    navigationProperty: string;
}

export interface StateInfo {
    inactiveState: number;
    inactiveStatus: number;
    inactiveStatusLabel: string;
}

/** Full metadata of the selected table (attributes and relationships). */
export interface EntityDetails extends EntityInfo {
    attributes: AttributeInfo[];
    manyToOne: ManyToOneInfo[];
    oneToMany: OneToManyInfo[];
    /** Null when the table has no usable inactive state (the error is raised when a manual merge is planned). */
    state: StateInfo | null;
    stateError?: string;
}

/** System view (savedquery) or personal view (userquery). */
export interface ViewItem {
    id: string;
    name: string;
    fetchXml: string;
    layoutXml?: string;
    isPersonal: boolean;
    isDefault: boolean;
}

/** Column displayed in the records grid. */
export interface GridColumn {
    /** Attribute name in the returned record (may be "alias.attribute" for a linked table). */
    key: string;
    header: string;
}

export type RecordSource = 'active' | 'search' | 'view';

export interface RecordLoadResult {
    records: DvRecord[];
    columns: GridColumn[];
    truncated: boolean;
    sourceKind: RecordSource;
    sourceName?: string;
}

/** Selected Master / Slave. */
export interface RecordRef {
    id: string;
    name: string;
}

/** One row of the comparison grid. */
export interface ComparisonRow {
    attribute: AttributeInfo;
    logicalName: string;
    displayName: string;
    masterValue: unknown;
    slaveValue: unknown;
    masterDisplay: string;
    slaveDisplay: string;
    masterEmpty: boolean;
    slaveEmpty: boolean;
    areEqual: boolean;
    bothEmpty: boolean;
    useSlave: boolean;
}

export const willChange = (row: ComparisonRow) => row.useSlave && !row.areEqual;

/** 1:N relationship with the number of child records linked to the Slave. */
export interface ChildRelationshipInfo {
    schemaName: string;
    referencingEntity: string;
    referencingEntityDisplayName: string;
    referencingEntitySetName: string;
    referencingAttribute: string;
    referencingEntityPrimaryId: string;
    navigationProperty: string;
    count: number;
}

export type MergeMode = 'manual' | 'native';

export interface FieldChange {
    logicalName: string;
    displayName: string;
    oldValue: string;
    newValue: string;
}

/** Everything needed to run a merge. */
export interface MergePlan {
    entityName: string;
    entityDisplayName: string;
    entitySetName: string;
    primaryIdAttribute: string;
    masterId: string;
    masterName: string;
    slaveId: string;
    slaveName: string;
    mode: MergeMode;
    /** Web API body of the Master update: only the changed fields. */
    masterUpdate: Record<string, unknown>;
    changes: FieldChange[];
    inactiveState: number;
    inactiveStatus: number;
    inactiveStatusLabel: string;
    relationshipsToReassign: ChildRelationshipInfo[];
}

/** Plugin preferences, persisted with the ToolBox settings API. */
export interface PluginSettings {
    language: 'en' | 'fr';
    lastEntityLogicalName?: string;
    maxRecords: number;
    onlyReadWriteTables: boolean;
    smartSlaveDefault: boolean;
    includeTransactionCurrency: boolean;
    additionalExcludedAttributes: string;
    showOnlyDifferences: boolean;
    hideEmptyOnBothSides: boolean;
    /** Additional text fields used for the server-side search, per table. */
    searchFields: Record<string, string[]>;
}

export const defaultSettings: PluginSettings = {
    language: 'en',
    maxRecords: 5000,
    onlyReadWriteTables: true,
    smartSlaveDefault: true,
    includeTransactionCurrency: false,
    additionalExcludedAttributes: '',
    showOnlyDifferences: false,
    hideEmptyOnBothSides: false,
    searchFields: {},
};

export function getAdditionalExcludedAttributes(settings: PluginSettings): string[] {
    return (settings.additionalExcludedAttributes ?? '')
        .split(/[,; ]+/)
        .map((a) => a.trim().toLowerCase())
        .filter((a) => a.length > 0);
}
