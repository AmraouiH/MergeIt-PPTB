import type { AttributeInfo, EntityDetails, PluginSettings } from '../models/types';
import { getAdditionalExcludedAttributes } from '../models/types';

/**
 * Rules selecting the attributes shown in the comparison, and therefore mergeable (port of Helpers/AttributeFilter.cs).
 */

export const OwnerAttribute = 'ownerid';
export const TransactionCurrencyAttribute = 'transactioncurrencyid';

/**
 * System attributes never offered for merging. Centralized list: changing it here is enough.
 * (ownerid and transactioncurrencyid are handled by dedicated options.)
 */
export const SystemExcludedAttributes = [
    'createdon',
    'createdby',
    'createdonbehalfby',
    'modifiedon',
    'modifiedby',
    'modifiedonbehalfby',
    'overriddencreatedon',
    'versionnumber',
    'importsequencenumber',
    'timezoneruleversionnumber',
    'utcconversiontimezonecode',
    'owningbusinessunit',
    'owninguser',
    'owningteam',
    'owneridtype',
    'statecode',
    'statuscode',
    'exchangerate',
    'processid',
    'stageid',
    'traversedpath',
    TransactionCurrencyAttribute,
];

/** Attribute types that cannot be updated or are irrelevant for a merge (Virtual covers images, files and multi-select choices). */
const ExcludedTypes = new Set(['Virtual', 'ManagedProperty', 'EntityName', 'Uniqueidentifier', 'CalendarRules', 'PartyList', 'State', 'Status']);

/** True if the attribute must appear in the comparison grid. */
export function isMergeable(attribute: AttributeInfo, entity: EntityDetails, settings: PluginSettings, includeOwner: boolean): boolean {
    const name = attribute.logicalName;

    if (!attribute.isCustomizable) return false;
    if (!attribute.isValidForUpdate) return false;
    if (!attribute.isValidForRead) return false;

    // Derived attributes (xxxname, xxxyominame, …)
    if (attribute.attributeOf) return false;

    if (ExcludedTypes.has(attribute.attributeType)) return false;

    // Calculated (1) or rollup (2) columns cannot be updated
    if (attribute.sourceType === 1 || attribute.sourceType === 2) return false;

    if (name === entity.primaryIdAttribute) return false;
    if (name.toLowerCase().endsWith('_base')) return false;

    if (name === OwnerAttribute) return includeOwner;
    if (name === TransactionCurrencyAttribute) return settings.includeTransactionCurrency;

    if (SystemExcludedAttributes.includes(name)) return false;
    if (getAdditionalExcludedAttributes(settings).includes(name)) return false;

    return true;
}
