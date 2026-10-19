/*
 * In-memory Dataverse + ToolBox host used by the end-to-end tests.
 * Injected in the page before the tool loads. It mimics the behavior of the Power Platform ToolBox desktop app
 * (queryData / executeBatch / executeTransaction / execute) and of the Dataverse Web API:
 *  - FetchXML runs against the real entity set name and validates attribute names and value types
 *    (e.g. returnedtypecode only accepts an Int32, like the real service);
 *  - responses carry the formatted-value and lookup annotations;
 *  - $batch changesets are all-or-nothing, PATCH bodies are validated (@odata.bind navigation properties, types);
 *  - any additionalHeaders argument is recorded as a violation (it would trigger a consent prompt in the ToolBox).
 */
(() => {
    const FV = '@OData.Community.Display.V1.FormattedValue';
    const LLN = '@Microsoft.Dynamics.CRM.lookuplogicalname';
    const label = (text) => ({ UserLocalizedLabel: { Label: text, LanguageCode: 1033 }, LocalizedLabels: [{ Label: text, LanguageCode: 1033 }] });
    const guid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    const isGuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v).replace(/[{}]/g, ''));
    const clone = (v) => JSON.parse(JSON.stringify(v));

    // #region Metadata

    const a = (name, type, extra = {}) => ({ name, type, update: true, read: true, customizable: true, ...extra });
    const state = (extra = {}) => a('statecode', 'State', extra);
    const status = (extra = {}) => a('statuscode', 'Status', extra);
    const common = () => [a('ownerid', 'Owner', { targets: ['systemuser', 'team'] }), a('createdon', 'DateTime', { update: false }), a('modifiedon', 'DateTime', { update: false }), state(), status()];

    const tables = {
        account: {
            otc: 1, set: 'accounts', pk: 'accountid', primaryName: 'name', display: 'Account', privileges: ['Read', 'Write'],
            attributes: [
                a('accountid', 'Uniqueidentifier', { update: false }),
                a('name', 'String'),
                a('accountnumber', 'String'),
                a('telephone1', 'String'),
                a('emailaddress1', 'String'),
                a('address1_city', 'String'),
                a('numberofemployees', 'Integer'),
                a('revenue', 'Money'),
                a('revenue_base', 'Money', { update: false }),
                a('creditonhold', 'Boolean'),
                a('industrycode', 'Picklist', { options: { 1: 'Accounting', 2: 'Agriculture', 3: 'Consulting' } }),
                a('primarycontactid', 'Lookup', { targets: ['contact'] }),
                a('primarycontactidname', 'String', { attributeOf: 'primarycontactid', update: false }),
                a('parentaccountid', 'Lookup', { targets: ['account'] }),
                a('masterid', 'Lookup', { targets: ['account'], update: false }),
                a('new_score', 'Integer', { sourceType: 1 }),
                a('entityimage', 'Virtual'),
                a('description', 'Memo'),
                ...common(),
            ],
            manyToOne: [
                { attr: 'primarycontactid', target: 'contact', nav: 'primarycontactid' },
                { attr: 'parentaccountid', target: 'account', nav: 'parentaccountid' },
                { attr: 'masterid', target: 'account', nav: 'masterid' },
            ],
            states: { inactiveStatus: 2, statusLabels: { 1: 'Active', 2: 'Inactive' } },
        },
        contact: {
            otc: 2, set: 'contacts', pk: 'contactid', primaryName: 'fullname', display: 'Contact', privileges: ['Read', 'Write'],
            attributes: [
                a('contactid', 'Uniqueidentifier', { update: false }),
                a('fullname', 'String', { update: false }),
                a('firstname', 'String'),
                a('lastname', 'String'),
                a('emailaddress1', 'String'),
                a('telephone1', 'String'),
                a('mobilephone', 'String'),
                a('address1_city', 'String'),
                a('parentcustomerid', 'Customer', { targets: ['account', 'contact'] }),
                ...common(),
            ],
            manyToOne: [
                { attr: 'parentcustomerid', target: 'account', nav: 'parentcustomerid_account' },
                { attr: 'parentcustomerid', target: 'contact', nav: 'parentcustomerid_contact' },
            ],
            states: { inactiveStatus: 2, statusLabels: { 1: 'Active', 2: 'Inactive' } },
        },
        task: {
            otc: 4212, set: 'tasks', pk: 'activityid', primaryName: 'subject', display: 'Task', privileges: ['Read'],
            attributes: [a('activityid', 'Uniqueidentifier', { update: false }), a('subject', 'String'), a('regardingobjectid', 'Lookup', { targets: ['account', 'contact'] }), ...common()],
            manyToOne: [
                { attr: 'regardingobjectid', target: 'account', nav: 'regardingobjectid_account_task' },
                { attr: 'regardingobjectid', target: 'contact', nav: 'regardingobjectid_contact_task' },
            ],
            states: { inactiveStatus: 5, statusLabels: { 2: 'Not Started', 5: 'Completed' } },
        },
        new_auditlog: {
            // Child table that does not support aggregate queries: its count fails.
            otc: 10051, set: 'new_auditlogs', pk: 'new_auditlogid', primaryName: 'new_name', display: 'Audit log', privileges: ['Read'], noAggregate: true,
            attributes: [a('new_auditlogid', 'Uniqueidentifier', { update: false }), a('new_name', 'String'), a('new_accountid', 'Lookup', { targets: ['account'] }), ...common()],
            manyToOne: [{ attr: 'new_accountid', target: 'account', nav: 'new_AccountId' }],
            states: { inactiveStatus: 2, statusLabels: { 1: 'Active', 2: 'Inactive' } },
        },
        new_project: {
            // Irregular entity set name: a naive "add an s" pluralization would fail.
            otc: 10050, set: 'new_projectset', pk: 'new_projectid', primaryName: 'new_name', display: 'Project', privileges: ['Read', 'Write'],
            attributes: [a('new_projectid', 'Uniqueidentifier', { update: false }), a('new_name', 'String'), a('new_accountid', 'Lookup', { targets: ['account'] }), ...common()],
            manyToOne: [{ attr: 'new_accountid', target: 'account', nav: 'new_AccountId' }],
            states: { inactiveStatus: 2, statusLabels: { 1: 'Active', 2: 'Inactive' } },
        },
        savedquery: {
            otc: 1039, set: 'savedqueries', pk: 'savedqueryid', primaryName: 'name', display: 'View', system: true,
            attributes: [a('savedqueryid', 'Uniqueidentifier'), a('name', 'String'), a('fetchxml', 'Memo'), a('layoutxml', 'Memo'), a('isdefault', 'Boolean'), a('querytype', 'Integer'), a('returnedtypecode', 'EntityName'), state()],
            manyToOne: [],
        },
        userquery: {
            otc: 4230, set: 'userqueries', pk: 'userqueryid', primaryName: 'name', display: 'Saved View', system: true,
            attributes: [a('userqueryid', 'Uniqueidentifier'), a('name', 'String'), a('fetchxml', 'Memo'), a('layoutxml', 'Memo'), a('querytype', 'Integer'), a('returnedtypecode', 'EntityName'), state()],
            manyToOne: [],
        },
        teammembership: {
            otc: 23, set: 'teammemberships', pk: 'teammembershipid', display: 'Team membership', system: true, intersect: true,
            attributes: [a('teammembershipid', 'Uniqueidentifier'), a('systemuserid', 'Uniqueidentifier'), a('teamid', 'Uniqueidentifier')],
            manyToOne: [],
        },
        systemuser: {
            otc: 8, set: 'systemusers', pk: 'systemuserid', primaryName: 'fullname', display: 'User', system: true,
            attributes: [a('systemuserid', 'Uniqueidentifier'), a('fullname', 'String')],
            manyToOne: [],
        },
        team: {
            otc: 9, set: 'teams', pk: 'teamid', primaryName: 'name', display: 'Team', system: true,
            attributes: [a('teamid', 'Uniqueidentifier'), a('name', 'String')],
            manyToOne: [],
        },
        activitypointer: {
            otc: 4200, set: 'activitypointers', pk: 'activityid', primaryName: 'subject', display: 'Activity', system: true,
            attributes: [a('activityid', 'Uniqueidentifier'), a('regardingobjectid', 'Lookup', { targets: ['account'] })],
            manyToOne: [],
        },
    };
    for (const [logicalName, t] of Object.entries(tables)) {
        t.logicalName = logicalName;
        t.attrMap = new Map(t.attributes.map((x) => [x.name, x]));
    }
    const bySet = new Map(Object.values(tables).map((t) => [t.set, t]));

    // 1:N relationships of account (children of the merged table)
    const oneToMany = {
        account: [
            { schema: 'contact_customer_accounts', child: 'contact', attr: 'parentcustomerid', nav: 'parentcustomerid_account' },
            { schema: 'Account_Tasks', child: 'task', attr: 'regardingobjectid', nav: 'regardingobjectid_account_task' },
            { schema: 'new_account_new_auditlog', child: 'new_auditlog', attr: 'new_accountid', nav: 'new_AccountId' },
            { schema: 'new_account_new_project', child: 'new_project', attr: 'new_accountid', nav: 'new_AccountId' },
            { schema: 'account_parent_account', child: 'account', attr: 'parentaccountid', nav: 'parentaccountid' },
            { schema: 'account_master_account', child: 'account', attr: 'masterid', nav: 'masterid' },
            { schema: 'Account_ActivityPointers', child: 'activitypointer', attr: 'regardingobjectid', nav: 'regardingobjectid_account' },
            { schema: 'account_primary_contact_dup', child: 'contact', attr: 'parentcustomerid', nav: 'parentcustomerid_account' },
        ],
        contact: [{ schema: 'contact_customer_contacts', child: 'contact', attr: 'parentcustomerid', nav: 'parentcustomerid_contact' }],
        new_project: [],
    };

    const privilegeId = (table, type) => guid(900000 + tables[table].otc * 10 + (type === 'Read' ? 1 : 2));

    function entityMetadata(t, props) {
        const full = {
            MetadataId: guid(800000 + t.otc),
            LogicalName: t.logicalName,
            DisplayName: label(t.display),
            EntitySetName: t.set,
            PrimaryIdAttribute: t.pk,
            PrimaryNameAttribute: t.primaryName ?? null,
            ObjectTypeCode: t.otc,
            IsValidForAdvancedFind: !t.system,
            IsCustomizable: { Value: !t.system },
            IsIntersect: !!t.intersect,
            DataProviderId: null,
            Privileges: [
                { PrivilegeType: 'Read', PrivilegeId: privilegeId(t.logicalName, 'Read'), Name: 'prvRead' + t.logicalName },
                { PrivilegeType: 'Write', PrivilegeId: privilegeId(t.logicalName, 'Write'), Name: 'prvWrite' + t.logicalName },
            ],
        };
        if (!props) return full;
        const result = {};
        for (const p of props) {
            if (!(p in full)) throw httpError(400, `Could not find a property named '${p}' on type 'Microsoft.Dynamics.CRM.EntityMetadata'.`);
            result[p] = full[p];
        }
        return result;
    }

    function attributeMetadata(x) {
        const typeName = x.type === 'Virtual' ? 'ImageType' : x.type + 'Type';
        return {
            '@odata.type': `#Microsoft.Dynamics.CRM.${x.type}AttributeMetadata`,
            LogicalName: x.name,
            DisplayName: label(x.name.charAt(0).toUpperCase() + x.name.slice(1)),
            AttributeType: x.type,
            AttributeTypeName: { Value: typeName },
            IsCustomizable: { Value: x.customizable },
            IsValidForUpdate: x.update,
            IsValidForRead: x.read,
            AttributeOf: x.attributeOf ?? null,
            ...(['String', 'Integer', 'Money', 'Decimal', 'DateTime', 'Boolean', 'Picklist'].includes(x.type) ? { SourceType: x.sourceType ?? 0 } : {}),
        };
    }

    // #endregion

    // #region Data

    const db = {};
    for (const name of Object.keys(tables)) db[name] = [];
    const ref = (entity, id) => ({ entity, id });
    const add = (table, id, fields) => db[table].push({ [tables[table].pk]: id, statecode: 0, statuscode: 1, ownerid: ref('systemuser', USER), createdon: '2026-01-01T10:00:00Z', ...fields });
    const USER = guid(1);
    const OTHER_USER = guid(2);
    db.systemuser.push({ systemuserid: USER, fullname: 'Test User' }, { systemuserid: OTHER_USER, fullname: 'Other User' });
    db.team.push({ teamid: guid(3), name: 'Sales team' });
    db.teammembership.push({ teammembershipid: guid(4), systemuserid: USER, teamid: guid(3) });

    // Contacts
    add('contact', guid(201), { firstname: 'Alice', lastname: 'Martin', fullname: 'Alice Martin', emailaddress1: 'alice@contoso.com' });
    add('contact', guid(202), { firstname: 'Bob', lastname: 'Durand', fullname: 'Bob Durand' });
    add('contact', guid(203), { firstname: 'Chloé', lastname: 'Petit', fullname: 'Chloé Petit', telephone1: '0102' });
    add('contact', guid(204), { firstname: 'Chloe', lastname: 'Petit', fullname: 'Chloe Petit', telephone1: '0103', emailaddress1: 'chloe@x.com' });

    // Accounts: A (master) / B (slave) for the manual merge
    add('account', guid(101), { name: 'Contoso A', telephone1: '111', numberofemployees: 10, industrycode: 1, primarycontactid: ref('contact', guid(201)), address1_city: 'Seattle', revenue: 1000 });
    add('account', guid(102), { name: 'Contoso B', telephone1: '222', emailaddress1: 'b@contoso.com', numberofemployees: 20, industrycode: 3, creditonhold: true, primarycontactid: ref('contact', guid(202)), ownerid: ref('systemuser', OTHER_USER), address1_city: 'Seattle' });
    // Accounts C / D: rollback scenario (D has a completed task)
    add('account', guid(103), { name: 'Fabrikam C', telephone1: '333' });
    add('account', guid(104), { name: 'Fabrikam D', telephone1: '444', emailaddress1: 'd@fabrikam.com' });
    // Accounts E / F: lookup clearing
    add('account', guid(105), { name: 'Litware E', primarycontactid: ref('contact', guid(201)) });
    add('account', guid(106), { name: 'Litware F' });
    // Inactive account (must not be listed)
    add('account', guid(107), { name: 'Contoso Old', statecode: 1, statuscode: 2 });

    // Children of B
    db.contact.find((c) => c.contactid === guid(201)).parentcustomerid = ref('account', guid(102));
    db.contact.find((c) => c.contactid === guid(202)).parentcustomerid = ref('account', guid(102));
    add('task', guid(301), { subject: 'Call B', regardingobjectid: ref('account', guid(102)) });
    add('new_project', guid(401), { new_name: 'Project B', new_accountid: ref('account', guid(102)) });
    // Child of D: a completed task (Dataverse refuses to update it)
    add('task', guid(302), { subject: 'Done D', regardingobjectid: ref('account', guid(104)), statecode: 1, statuscode: 5 });

    // Views
    const accountLayout = '<grid name="resultset" object="1" jump="name" select="1" icon="1" preview="1"><row name="result" id="accountid"><cell name="name" width="300" /><cell name="address1_city" width="150" /><cell name="telephone1" width="100" /></row></grid>';
    db.savedquery.push(
        { savedqueryid: guid(501), name: 'Active Accounts', isdefault: true, querytype: 0, returnedtypecode: 1, statecode: 0, fetchxml: '<fetch version="1.0" mapping="logical"><entity name="account"><attribute name="name" /><attribute name="telephone1" /><attribute name="accountid" /><order attribute="name" descending="false" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>', layoutxml: accountLayout },
        { savedqueryid: guid(502), name: 'Seattle Accounts', isdefault: false, querytype: 0, returnedtypecode: 1, statecode: 0, fetchxml: '<fetch version="1.0" top="50"><entity name="account"><attribute name="name" /><attribute name="address1_city" /><filter><condition attribute="address1_city" operator="eq" value="Seattle" /></filter></entity></fetch>', layoutxml: accountLayout },
        { savedqueryid: guid(503), name: 'Accounts by city (aggregate)', isdefault: false, querytype: 0, returnedtypecode: 1, statecode: 0, fetchxml: '<fetch aggregate="true"><entity name="account"><attribute name="address1_city" groupby="true" alias="city" /></entity></fetch>' },
        { savedqueryid: guid(504), name: 'Account lookup view', isdefault: false, querytype: 64, returnedtypecode: 1, statecode: 0, fetchxml: '<fetch><entity name="account"><attribute name="name" /></entity></fetch>' },
        { savedqueryid: guid(505), name: 'Active Contacts', isdefault: true, querytype: 0, returnedtypecode: 2, statecode: 0, fetchxml: '<fetch><entity name="contact"><attribute name="fullname" /><attribute name="contactid" /></entity></fetch>', layoutxml: '<grid><row><cell name="fullname" /></row></grid>' },
    );
    db.userquery.push({ userqueryid: guid(601), name: 'My Fabrikam accounts', querytype: 0, returnedtypecode: 1, statecode: 0, fetchxml: '<fetch><entity name="account"><attribute name="name" /><filter><condition attribute="name" operator="like" value="Fabrikam%" /></filter></entity></fetch>', layoutxml: '<grid><row><cell name="name" /></row></grid>' });

    // #endregion

    // #region Helpers

    function httpError(status, message) {
        const error = new Error(`Dataverse request failed (${status}): ${message}`);
        error.status = status;
        error.dataverseMessage = message;
        return error;
    }

    function tableOrThrow(name) {
        const t = tables[name];
        if (!t) throw httpError(404, `The entity with a name = '${name}' was not found in the MetadataCache.`);
        return t;
    }

    function displayOf(entity, id) {
        const t = tables[entity];
        const row = db[entity]?.find((r) => r[t.pk] === id);
        return row ? String(row[t.primaryName] ?? id) : id;
    }

    function formatRecord(t, row, columns) {
        const out = { '@odata.etag': 'W/"1"' };
        out[t.pk] = row[t.pk];
        for (const name of columns) {
            const attr = t.attrMap.get(name);
            const value = row[name];
            if (value === undefined || value === null) {
                if (attr && ['Lookup', 'Customer', 'Owner'].includes(attr.type)) out[`_${name}_value`] = null;
                continue;
            }
            if (attr && ['Lookup', 'Customer', 'Owner'].includes(attr.type)) {
                out[`_${name}_value`] = value.id;
                out[`_${name}_value${FV}`] = displayOf(value.entity, value.id);
                out[`_${name}_value${LLN}`] = value.entity;
                continue;
            }
            out[name] = value;
            if (attr?.type === 'Picklist') out[name + FV] = attr.options[value];
            else if (attr?.type === 'State') out[name + FV] = value === 0 ? 'Active' : 'Inactive';
            else if (attr?.type === 'Status') out[name + FV] = t.states?.statusLabels?.[value] ?? String(value);
            else if (attr?.type === 'Boolean') out[name + FV] = value ? 'Yes' : 'No';
            else if (attr?.type === 'Money') out[name + FV] = '$' + Number(value).toFixed(2);
            else if (attr?.type === 'Integer') out[name + FV] = Number(value).toLocaleString('en-US');
            else if (attr?.type === 'DateTime') out[name + FV] = new Date(value).toLocaleString('en-US');
        }
        return out;
    }

    // #endregion

    // #region FetchXML engine

    function checkValueType(t, attr, value) {
        const type = attr.type;
        if (['Integer', 'State', 'Status', 'Picklist', 'EntityName'].includes(type)) {
            if (!/^-?\d+$/.test(String(value))) {
                throw httpError(400, `0x80040203: An exception System.FormatException was thrown while trying to convert input value '${value}' to attribute '${t.logicalName}.${attr.name}'. Expected type of attribute value: System.Int32. Exception raised: Input string was not in a correct format.`);
            }
        }
        if (['Uniqueidentifier', 'Lookup', 'Customer', 'Owner'].includes(type) && !isGuid(value)) {
            throw httpError(400, `0x80040203: Guid should contain 32 digits with 4 dashes (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Attribute '${attr.name}', value '${value}'.`);
        }
    }

    function rawForCompare(attr, value) {
        if (value === null || value === undefined) return null;
        if (['Lookup', 'Customer', 'Owner'].includes(attr.type)) return String(value.id).toLowerCase();
        if (attr.type === 'Uniqueidentifier') return String(value).toLowerCase();
        return value;
    }

    function matchCondition(t, row, condition) {
        const name = condition.getAttribute('attribute');
        const operator = condition.getAttribute('operator');
        const attr = t.attrMap.get(name);
        if (!attr) throw httpError(400, `'${t.logicalName}' entity doesn't contain attribute with Name = '${name}' and NameMapping = 'Logical'.`);
        const value = condition.getAttribute('value');
        if (value !== null && !['like', 'not-like'].includes(operator)) checkValueType(t, attr, value);
        const current = rawForCompare(attr, row[name]);
        const expected = value === null ? null : ['Integer', 'State', 'Status', 'Picklist', 'EntityName'].includes(attr.type) ? Number(value) : attr.type === 'Boolean' ? value === 'true' || value === '1' : ['Lookup', 'Customer', 'Owner', 'Uniqueidentifier'].includes(attr.type) ? value.toLowerCase() : value;
        switch (operator) {
            case 'eq':
                return current === expected;
            case 'ne':
                return current !== expected;
            case 'null':
                return current === null || current === '';
            case 'not-null':
                return current !== null && current !== '';
            case 'like': {
                if (current === null) return false;
                const pattern = '^' + value.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$';
                return new RegExp(pattern, 'i').test(String(current));
            }
            default:
                throw httpError(400, `Unsupported operator in mock: ${operator}`);
        }
    }

    function matchFilter(t, row, filter) {
        const and = (filter.getAttribute('type') ?? 'and') === 'and';
        const results = Array.from(filter.children).map((child) => (child.tagName === 'condition' ? matchCondition(t, row, child) : child.tagName === 'filter' ? matchFilter(t, row, child) : true));
        if (results.length === 0) return true;
        return and ? results.every(Boolean) : results.some(Boolean);
    }

    function runFetch(fetchXml, entitySet) {
        const doc = new DOMParser().parseFromString(fetchXml, 'text/xml');
        if (doc.getElementsByTagName('parsererror').length) throw httpError(400, 'Invalid FetchXML');
        const root = doc.documentElement;
        const entityEl = Array.from(root.children).find((c) => c.tagName === 'entity');
        const t = tableOrThrow(entityEl.getAttribute('name'));
        if (t.set !== entitySet) throw httpError(400, `The entity name '${t.logicalName}' in the FetchXML does not match the entity set '${entitySet}'.`);
        if (root.getAttribute('top') && (root.getAttribute('count') || root.getAttribute('page'))) throw httpError(400, 'The top attribute cannot be specified with paging attribute page or count.');

        const children = Array.from(entityEl.children);
        const allAttributes = children.some((c) => c.tagName === 'all-attributes');
        const attributeEls = children.filter((c) => c.tagName === 'attribute');
        for (const el of attributeEls) {
            const name = el.getAttribute('name');
            if (!t.attrMap.has(name)) throw httpError(400, `'${t.logicalName}' entity doesn't contain attribute with Name = '${name}' and NameMapping = 'Logical'.`);
        }

        let rows = db[t.logicalName].filter((row) => children.filter((c) => c.tagName === 'filter').every((f) => matchFilter(t, row, f)));

        if (root.getAttribute('aggregate') === 'true') {
            if (t.noAggregate) throw httpError(400, `0x8004d2ab: Aggregate queries are not supported for the table '${t.logicalName}'.`);
            const countEl = attributeEls.find((el) => el.getAttribute('aggregate') === 'count');
            if (!countEl) throw httpError(400, 'Mock: only count aggregates are supported');
            return { value: [{ [countEl.getAttribute('alias')]: rows.length }] };
        }

        for (const order of children.filter((c) => c.tagName === 'order')) {
            const name = order.getAttribute('attribute');
            rows = [...rows].sort((x, y) => String(x[name] ?? '').localeCompare(String(y[name] ?? '')));
        }

        const columns = allAttributes ? t.attributes.map((x) => x.name) : attributeEls.map((el) => el.getAttribute('name'));
        const top = Number(root.getAttribute('top') ?? 0);
        const count = Number(root.getAttribute('count') ?? 5000);
        const page = Number(root.getAttribute('page') ?? 1);
        if (top) rows = rows.slice(0, top);
        const pageRows = rows.slice((page - 1) * count, page * count);
        const more = page * count < rows.length;

        const result = { '@odata.context': `mock/$metadata#${t.set}`, value: pageRows.map((row) => formatRecord(t, row, columns)), '@Microsoft.Dynamics.CRM.morerecords': more };
        if (more) {
            const cookie = encodeURIComponent(encodeURIComponent(`<cookie page="${page}"><${t.pk} last="{${pageRows[pageRows.length - 1][t.pk]}}" /></cookie>`));
            result['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'] = `<cookie pagenumber="${page + 1}" pagingcookie="${cookie}" istracking="False" />`;
        }
        return result;
    }

    // #endregion

    // #region Web API routing (GET)

    function getRequest(path) {
        const [resource, query = ''] = path.split('?');
        const params = new URLSearchParams(query);

        if (resource === 'EntityDefinitions') {
            if (!query.includes("$expand=Attributes($select=LogicalName;$filter=LogicalName eq 'statecode')")) throw httpError(400, 'Mock: unexpected EntityDefinitions query ' + query);
            return {
                value: Object.values(tables).map((t) => ({ LogicalName: t.logicalName, Attributes: t.attrMap.has('statecode') ? [{ LogicalName: 'statecode' }] : [] })),
            };
        }

        const definition = /^EntityDefinitions\(LogicalName='([^']+)'\)(?:\/(.*))?$/.exec(resource);
        if (definition) {
            const t = tableOrThrow(definition[1]);
            const sub = definition[2] ?? '';
            if (sub === '') return entityMetadata(t, params.get('$select')?.split(','));
            if (sub === 'Attributes') return { value: t.attributes.map(attributeMetadata) };
            const single = /^Attributes\(LogicalName='([^']+)'\)$/.exec(sub);
            if (single) {
                const x = t.attrMap.get(single[1]);
                if (!x) throw httpError(404, `Attribute ${single[1]} not found`);
                return { IsValidForUpdate: x.update };
            }
            if (sub === 'Attributes/Microsoft.Dynamics.CRM.StateAttributeMetadata') {
                if (!t.states) return { value: [] };
                return { value: [{ LogicalName: 'statecode', OptionSet: { Options: [{ Value: 0, DefaultStatus: 1, Label: label('Active') }, { Value: 1, DefaultStatus: t.states.inactiveStatus, Label: label('Inactive') }] } }] };
            }
            if (sub === 'Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata') {
                if (!t.states) return { value: [] };
                return { value: [{ LogicalName: 'statuscode', OptionSet: { Options: Object.entries(t.states.statusLabels).map(([v, l]) => ({ Value: Number(v), Label: label(l) })) } }] };
            }
            if (sub === 'ManyToOneRelationships') {
                return { value: t.manyToOne.map((r) => ({ ReferencingAttribute: r.attr, ReferencedEntity: r.target, ReferencingEntityNavigationPropertyName: r.nav })) };
            }
            if (sub === 'OneToManyRelationships') {
                return {
                    value: (oneToMany[t.logicalName] ?? []).map((r) => ({ SchemaName: r.schema, ReferencedAttribute: t.pk, ReferencingEntity: r.child, ReferencingAttribute: r.attr, ReferencingEntityNavigationPropertyName: r.nav })),
                };
            }
            throw httpError(400, 'Mock: unsupported metadata path ' + sub);
        }

        const t = bySet.get(resource);
        if (!t) throw httpError(404, `Resource not found for the segment '${resource}'.`);
        const fetchXml = params.get('fetchXml');
        if (!fetchXml) throw httpError(400, 'Mock: only fetchXml queries are supported on entity sets');
        return runFetch(fetchXml, resource);
    }

    // #endregion

    // #region Writes

    function applyPatch(store, url, body) {
        const match = /^([A-Za-z_]+)\(([0-9a-fA-F-]{36})\)$/.exec(url);
        if (!match) throw httpError(400, `Mock: unsupported PATCH url ${url}`);
        const t = bySet.get(match[1]);
        if (!t) throw httpError(404, `Resource not found for the segment '${match[1]}'.`);
        const row = store[t.logicalName].find((r) => r[t.pk] === match[2].toLowerCase());
        if (!row) throw httpError(404, `${t.logicalName} With Id = ${match[2]} Does Not Exist`);
        if (row.statecode !== 0 && !('statecode' in body)) throw httpError(400, `This ${t.logicalName} is inactive and cannot be updated (record ${match[2]}).`);
        applyFields(store, t, row, body);
    }

    function applyFields(store, t, row, body) {
        for (const [key, value] of Object.entries(body)) {
            if (key === '@odata.type') continue;
            if (key.endsWith('@odata.bind')) {
                const nav = key.slice(0, -'@odata.bind'.length);
                const relationship = nav === 'ownerid' ? { attr: 'ownerid' } : t.manyToOne.find((r) => r.nav === nav);
                if (!relationship) throw httpError(400, `An undeclared property '${nav}' which only has property annotations in the payload but no property value was found in the payload.`);
                if (value === null) {
                    row[relationship.attr] = null;
                    continue;
                }
                const target = /^\/([A-Za-z_]+)\(([0-9a-fA-F-]{36})\)$/.exec(String(value));
                if (!target) throw httpError(400, `Invalid @odata.bind value '${value}'`);
                const targetTable = bySet.get(target[1]);
                if (!targetTable) throw httpError(400, `Resource not found for the segment '${target[1]}'.`);
                if (relationship.target && relationship.target !== targetTable.logicalName) throw httpError(400, `Navigation property '${nav}' targets ${relationship.target}, not ${targetTable.logicalName}.`);
                if (!store[targetTable.logicalName].some((r) => r[targetTable.pk] === target[2].toLowerCase())) throw httpError(404, `${targetTable.logicalName} With Id = ${target[2]} Does Not Exist`);
                row[relationship.attr] = ref(targetTable.logicalName, target[2].toLowerCase());
                continue;
            }
            const attr = t.attrMap.get(key);
            if (!attr) throw httpError(400, `The property '${key}' does not exist on type 'Microsoft.Dynamics.CRM.${t.logicalName}'.`);
            if (['Lookup', 'Customer', 'Owner'].includes(attr.type)) throw httpError(400, `An undeclared property '${key}' which only has property annotations in the payload but no property value was found in the payload.`);
            if (!attr.update && !['statecode', 'statuscode'].includes(key)) throw httpError(400, `The attribute '${key}' is not valid for update.`);
            if (value !== null) {
                const ok =
                    ['Integer', 'State', 'Status', 'Picklist'].includes(attr.type) ? Number.isInteger(value) :
                    attr.type === 'Money' ? typeof value === 'number' :
                    attr.type === 'Boolean' ? typeof value === 'boolean' :
                    ['String', 'Memo', 'DateTime'].includes(attr.type) ? typeof value === 'string' : true;
                if (!ok) throw httpError(400, `Cannot convert the literal '${JSON.stringify(value)}' to the expected type for '${key}' (${attr.type}).`);
            }
            row[key] = value;
        }
    }

    // #endregion

    // #region Host APIs

    const calls = [];
    const violations = [];
    const delay = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
    const checkHeaders = (method, headers) => {
        if (headers !== undefined) violations.push(`${method} called with additionalHeaders ${JSON.stringify(headers)} (would trigger a consent prompt)`);
    };
    const wrapError = (method, error) => new Error(`Error invoking remote method 'dataverse.${method}': Error: ${error.dataverseMessage ?? error.message}`);

    const settingsStore = {};
    const notifications = [];

    window.__mock = { db, calls, violations, notifications, tables, settingsStore, guid };

    window.toolboxAPI = {
        settings: {
            get: async (key) => clone(settingsStore[key] ?? window.__seedSettings?.[key]),
            set: async (key, value) => {
                settingsStore[key] = clone(value);
            },
            getAll: async () => clone(settingsStore),
            setAll: async (all) => Object.assign(settingsStore, clone(all)),
        },
        utils: {
            getCurrentTheme: async () => window.__mockTheme ?? 'light',
            showNotification: async (n) => {
                notifications.push(n);
            },
            copyToClipboard: async (text) => {
                window.__clipboard = text;
            },
            openInConnectionBrowser: async () => {},
            executeParallel: async (...ops) => Promise.all(ops.map((o) => (typeof o === 'function' ? o() : o))),
        },
        connections: {
            getActiveConnection: async () => ({ id: 'c1', name: 'Mock Dev', url: 'https://mock.crm.dynamics.com', environment: 'Dev' }),
            getConnection: async () => null,
            getConnections: async () => [],
            getSecondaryConnection: async () => null,
        },
        events: { on: () => {}, off: () => {}, getHistory: async () => [] },
        preventClose: async () => {
            calls.push(['preventClose']);
            return true;
        },
        releasePreventClose: async () => {
            calls.push(['releasePreventClose']);
            return true;
        },
        getToolContext: async () => ({ toolId: 'mergeit', connectionUrl: 'https://mock.crm.dynamics.com' }),
    };

    window.dataverseAPI = {
        queryData: async (path, target, headers) => {
            calls.push(['queryData', path]);
            checkHeaders('queryData', headers);
            await delay();
            try {
                return clone(getRequest(path));
            } catch (error) {
                throw wrapError('queryData', error);
            }
        },
        fetchXmlQuery: async (fetchXml, target, headers) => {
            // Same behavior as the ToolBox: the entity set is guessed by pluralizing the logical name.
            calls.push(['fetchXmlQuery', fetchXml]);
            checkHeaders('fetchXmlQuery', headers);
            const name = /<entity\s+name=["']([^"']+)["']/i.exec(fetchXml)[1];
            try {
                return clone(runFetch(fetchXml, name + 's'));
            } catch (error) {
                throw wrapError('fetchXmlQuery', error);
            }
        },
        getAllEntitiesMetadata: async (props, target, headers) => {
            calls.push(['getAllEntitiesMetadata', props]);
            checkHeaders('getAllEntitiesMetadata', headers);
            await delay();
            try {
                return { value: Object.values(tables).map((t) => entityMetadata(t, props)) };
            } catch (error) {
                throw wrapError('getAllEntitiesMetadata', error);
            }
        },
        getEntityMetadata: async (name, byName, props, target, headers) => {
            calls.push(['getEntityMetadata', name]);
            checkHeaders('getEntityMetadata', headers);
            await delay();
            try {
                return entityMetadata(tableOrThrow(name), props);
            } catch (error) {
                throw wrapError('getEntityMetadata', error);
            }
        },
        execute: async (request, target, headers) => {
            calls.push(['execute', clone(request)]);
            checkHeaders('execute', headers);
            await delay();
            const { operationName } = request;
            if (operationName === 'WhoAmI') return { UserId: USER, BusinessUnitId: guid(10), OrganizationId: guid(11) };
            if (operationName === 'RetrieveUserPrivileges') {
                if (request.entityName !== 'systemuser' || request.entityId !== USER) throw new Error('Mock: RetrieveUserPrivileges bound to the wrong record');
                return {
                    RolePrivileges: Object.values(tables)
                        .filter((t) => t.privileges)
                        .flatMap((t) => t.privileges.map((p) => ({ PrivilegeId: privilegeId(t.logicalName, p), Depth: 'Global', PrivilegeName: 'prv' + p + t.logicalName }))),
                };
            }
            if (operationName === 'RetrieveTeamPrivileges') return { RolePrivileges: [] };
            if (operationName === 'Merge') {
                try {
                    nativeMerge(request.parameters);
                } catch (error) {
                    throw wrapError('execute', error);
                }
                return {};
            }
            throw wrapError('execute', httpError(404, `Resource not found for the segment '${operationName}'.`));
        },
        executeBatch: async (requests, target, headers) => {
            calls.push(['executeBatch', clone(requests)]);
            checkHeaders('executeBatch', headers);
            await delay();
            if (requests.length > 1000) throw new Error('Dataverse batch requests cannot exceed 1000 operations');
            const results = [];
            for (let index = 0; index < requests.length; index++) {
                const r = requests[index];
                const contentId = r.contentId ?? String(index + 1);
                if (r.headers && Object.keys(r.headers).length) violations.push(`executeBatch operation headers ${JSON.stringify(r.headers)} (would trigger a consent prompt)`);
                try {
                    if (r.method !== 'GET') throw httpError(400, 'Mock: executeBatch only supports GET');
                    results.push({ contentId, status: 200, statusText: 'OK', headers: {}, body: clone(getRequest(r.url)) });
                } catch (error) {
                    // Dataverse stops at the first failed operation; the parts carry no Content-ID outside a changeset.
                    if (index < requests.length - 1 || results.length > 0) {
                        throw new Error("Error invoking remote method 'dataverse.executeBatch': Error: Dataverse executeBatch failed: Malformed Dataverse batch response: invalid content ID correlation");
                    }
                    results.push({ contentId, status: error.status ?? 500, statusText: 'Error', headers: {}, body: { error: { code: '0x0', message: error.dataverseMessage ?? error.message } } });
                }
            }
            return results;
        },
        executeTransaction: async (requests, target, headers) => {
            calls.push(['executeTransaction', clone(requests)]);
            checkHeaders('executeTransaction', headers);
            await delay();
            if (requests.length === 0) throw new Error('Dataverse batch requests cannot be empty');
            if (requests.length > 1000) throw new Error('Dataverse batch requests cannot exceed 1000 operations');
            const working = clone(db);
            for (let i = 0; i < requests.length; i++) {
                const r = requests[i];
                if (r.headers && Object.keys(r.headers).length) violations.push(`executeTransaction operation headers ${JSON.stringify(r.headers)} (would trigger a consent prompt)`);
                if (r.method === 'GET') throw new Error('Dataverse transactions cannot contain read operations');
                try {
                    if (r.method !== 'PATCH') throw httpError(400, 'Mock: only PATCH is supported in transactions');
                    applyPatch(working, r.url, r.body ?? {});
                } catch (error) {
                    // A failed changeset returns only the failing operation, with its Content-ID.
                    return [{ contentId: r.contentId ?? String(i + 1), status: error.status ?? 500, statusText: 'Bad Request', headers: {}, body: { error: { code: '0x80040265', message: error.dataverseMessage ?? error.message } } }];
                }
            }
            for (const key of Object.keys(db)) db[key] = working[key];
            return requests.map((r, i) => ({ contentId: r.contentId ?? String(i + 1), status: 204, statusText: 'No Content', headers: {} }));
        },
    };

    function nativeMerge(p) {
        if (p.PerformParentingChecks !== false) throw httpError(400, 'Mock: PerformParentingChecks must be false');
        const type = p.Target?.['@odata.type'];
        const logicalName = String(type ?? '').replace('Microsoft.Dynamics.CRM.', '');
        if (!['account', 'contact', 'lead', 'incident'].includes(logicalName)) throw httpError(400, `Merge is not supported for ${type}`);
        if (p.Subordinate?.['@odata.type'] !== type || p.UpdateContent?.['@odata.type'] !== type) throw httpError(400, 'Mock: @odata.type mismatch in Merge parameters');
        const t = tables[logicalName];
        const masterId = p.Target[t.pk];
        const slaveId = p.Subordinate[t.pk];
        const master = db[logicalName].find((r) => r[t.pk] === masterId);
        const slave = db[logicalName].find((r) => r[t.pk] === slaveId);
        if (!master || !slave) throw httpError(404, 'Mock: Merge record not found');
        const working = clone(db);
        const wMaster = working[logicalName].find((r) => r[t.pk] === masterId);
        const content = { ...p.UpdateContent };
        delete content['@odata.type'];
        applyFields(working, t, wMaster, content);
        // Reassign every child (simplified: all lookups pointing to the Slave)
        for (const [name, rows] of Object.entries(working)) {
            for (const row of rows) {
                for (const [k, v] of Object.entries(row)) {
                    if (v && typeof v === 'object' && v.entity === logicalName && v.id === slaveId && !(name === logicalName && row[t.pk] === slaveId)) row[k] = ref(logicalName, masterId);
                }
            }
        }
        const wSlave = working[logicalName].find((r) => r[t.pk] === slaveId);
        wSlave.statecode = 1;
        wSlave.statuscode = t.states.inactiveStatus;
        wSlave.masterid = ref(logicalName, masterId);
        for (const key of Object.keys(db)) db[key] = working[key];
    }

    // #endregion
})();
