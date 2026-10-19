/*
 * End-to-end tests of MergeIt against an in-memory Dataverse (tests/e2e/mockDataverse.js).
 * Usage: npm run test:e2e   (builds dist in development mode, serves it, drives Microsoft Edge / Chrome headless)
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..', '..');
const mockPath = path.join(__dirname, 'mockDataverse.js');
const shotsDir = path.join(__dirname, 'screenshots');
const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;

const g = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

function findBrowser() {
    const candidates = [
        process.env.PW_BROWSER,
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) throw new Error('No Chromium-based browser found. Set PW_BROWSER to its executable path.');
    return found;
}

// #region Mini test harness

const results = [];
let browser;

async function test(name, fn) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().includes('MergeIt:')) pageErrors.push('console.error: ' + m.text());
    });
    await page.addInitScript({ path: mockPath });
    const started = Date.now();
    try {
        await page.goto(BASE);
        await fn(page);
        const violations = await page.evaluate(() => window.__mock.violations);
        if (violations.length) throw new Error('Host API misuse:\n  ' + violations.join('\n  '));
        if (pageErrors.length) throw new Error('Page errors:\n  ' + pageErrors.join('\n  '));
        results.push({ name, ok: true, ms: Date.now() - started });
        console.log(`  ✔ ${name}`);
    } catch (error) {
        results.push({ name, ok: false, error });
        console.log(`  ✘ ${name}\n      ${String(error.message).split('\n').join('\n      ')}`);
        fs.mkdirSync(shotsDir, { recursive: true });
        await page.screenshot({ path: path.join(shotsDir, name.replace(/[^a-z0-9]+/gi, '_') + '.png') }).catch(() => undefined);
    } finally {
        await page.close();
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${message}\n      expected: ${e}\n      actual:   ${a}`);
}

// #endregion

// #region Page helpers

async function idle(page) {
    await page.waitForTimeout(80);
    await page.waitForSelector('.mi-busy', { state: 'detached', timeout: 15000 });
    await page.waitForTimeout(80);
}

/** Returns the open message dialog text (or null) and closes it with OK. */
async function takeDialog(page) {
    const dialog = page.locator('[role=dialog]').last();
    if (!(await dialog.count())) return null;
    const text = await dialog.innerText();
    await dialog.locator('button', { hasText: /^(OK|Done)$/ }).click();
    await dialog.waitFor({ state: 'detached' });
    return text;
}

async function expectNoDialog(page, context) {
    const text = (await page.locator('[role=dialog]').count()) ? await page.locator('[role=dialog]').last().innerText() : null;
    assert(text === null, `${context}: unexpected dialog\n      ${String(text).replace(/\n/g, ' | ')}`);
}

async function ready(page) {
    await page.waitForSelector('.mi-header');
    await idle(page);
    await expectNoDialog(page, 'startup');
}

async function selectTable(page, query, optionText) {
    await page.click('.mi-table-combo input');
    await page.fill('.mi-table-combo input', query);
    const logicalName = /\(([^)]+)\)$/.exec(optionText)[1];
    await page.locator('[role=option]', { has: page.locator('.mi-picker-logical', { hasText: new RegExp(`^${logicalName}$`) }) }).click();
    await idle(page);
}

const recordNames = (page) => page.locator('.mi-records-grid tbody tr td:nth-child(2)').allInnerTexts();

async function pick(page, name, role) {
    await page.locator('.mi-records-grid tbody tr', { hasText: name }).first().click();
    await page.locator('.mi-records-footer button', { hasText: role === 'master' ? 'Set as Master' : 'Set as Slave' }).click();
}

async function compare(page) {
    await page.locator('.mi-records-footer button', { hasText: 'Compare' }).click();
    await idle(page);
}

const compareRow = (page, logicalName) => page.locator('.mi-compare-grid tbody tr', { has: page.locator('td.mi-mono', { hasText: new RegExp(`^${logicalName}$`) }) });

async function chooseSlave(page, logicalName) {
    await compareRow(page, logicalName).locator('td.mi-value').nth(1).click();
}

async function chooseMaster(page, logicalName) {
    await compareRow(page, logicalName).locator('td.mi-value').nth(0).click();
}

async function stats(page) {
    const values = await page.locator('.mi-stat-value').allInnerTexts();
    return { fields: values[0], differences: values[1], changes: values[2], children: values[3] };
}

/** Clicks Merge, returns the confirmation text, confirms, and returns the result dialog text. */
async function merge(page) {
    await page.click('.mi-merge-button');
    const confirm = page.locator('[role=dialog]', { hasText: 'Confirm the merge' });
    await confirm.waitFor();
    const confirmText = await confirm.innerText();
    await confirm.locator('button', { hasText: 'Merge now' }).click();
    await idle(page);
    const resultText = await takeDialog(page);
    return { confirmText, resultText };
}

const db = (page) => page.evaluate(() => window.__mock.db);
const calls = (page, method) => page.evaluate((m) => window.__mock.calls.filter((c) => c[0] === m), method);

// #endregion

async function run() {
    console.log('Building (development mode)…');
    execSync('npx vite build --mode development', { cwd: root, stdio: 'ignore' });

    const vite = await import('vite');
    const server = await vite.preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
    browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
    console.log('Running tests…\n');

    try {
        await test('Startup: tables are loaded and filtered (Read + Write privileges, statecode, customizable)', async (page) => {
            await ready(page);
            await page.click('.mi-table-combo input');
            const options = await page.locator('[role=option]').allInnerTexts();
            assertEqual(options.map((o) => o.replace(/\s+/g, ' ')), ['Account account', 'Contact contact', 'Project new_project'], 'table list');
            await page.keyboard.press('Escape');
            assert((await page.locator('.mi-connection').innerText()).includes('Mock Dev'), 'connection name shown in the header');
        });

        await test('Table selection: metadata, views (numeric returnedtypecode) and active records', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await expectNoDialog(page, 'after table selection');
            const names = await recordNames(page);
            assertEqual(names, ['Contoso A', 'Contoso B', 'Fabrikam C', 'Fabrikam D', 'Litware E', 'Litware F'], 'active accounts (inactive one excluded)');
            const viewQueries = (await calls(page, 'queryData')).map((c) => c[1]).filter((q) => q.startsWith('savedqueries') || q.startsWith('userqueries'));
            assert(viewQueries.length === 2, 'system and personal views queried through their entity sets');
            assert(decodeURIComponent(viewQueries[0]).includes('attribute="returnedtypecode" operator="eq" value="1"'), 'returnedtypecode filtered with the object type code');
            await page.click('.mi-view-dropdown');
            const views = await page.locator('[role=option]').allInnerTexts();
            assertEqual(
                views,
                ['(Active records — default load)', '[System] Active Accounts (default)', '[System] Accounts by city (aggregate)', '[System] Seattle Accounts', '[Personal] My Fabrikam accounts'],
                'views (lookup view excluded, default first)',
            );
            await page.keyboard.press('Escape');
            assert((await page.locator('.mi-records-footer .mi-muted').innerText()).includes('Active records: 6 record(s)'), 'record count label');
            assertEqual((await calls(page, 'fetchXmlQuery')).length, 0, 'fetchXmlQuery (guessed entity set names) is not used');
        });

        await test('Custom table with an irregular entity set name loads', async (page) => {
            await ready(page);
            await selectTable(page, 'proj', 'Project (new_project)');
            await expectNoDialog(page, 'new_project');
            assertEqual(await recordNames(page), ['Project B'], 'projects');
        });

        await test('Local filter, server search and search fields', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await page.fill('.mi-card-records .mi-search input', 'Fabrikam');
            assertEqual(await recordNames(page), ['Fabrikam C', 'Fabrikam D'], 'instant local filter');

            await page.fill('.mi-card-records .mi-search input', '444');
            await page.keyboard.press('Enter');
            await idle(page);
            assertEqual(await recordNames(page), [], 'server search on the name only finds nothing for a phone number');

            await page.locator('button', { hasText: 'Search fields…' }).click();
            const dialog = page.locator('[role=dialog]', { hasText: 'Search fields' });
            await dialog.getByLabel('Telephone1 (telephone1)').check();
            await dialog.locator('button', { hasText: /^OK$/ }).click();
            await page.locator('.mi-card-records button', { hasText: /^Search$/ }).click();
            await idle(page);
            assertEqual(await recordNames(page), ['Fabrikam D'], 'server search uses the selected search field');
            assert((await page.locator('.mi-records-grid thead').innerText()).includes('TELEPHONE1'), 'search field shown as a column');
            assert((await page.locator('.mi-records-footer .mi-muted').innerText()).includes('Search "444"'), 'source label');
            const stored = await page.evaluate(() => window.__mock.settingsStore.settings.searchFields);
            assertEqual(stored, { account: ['telephone1'] }, 'search fields saved in the ToolBox settings');
        });

        await test('Views: system view (top removed, active only), personal view, aggregate view refused', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            const runView = async (text) => {
                await page.click('.mi-view-dropdown');
                await page.locator('[role=option]', { hasText: text }).click();
                await page.locator('.mi-card-records button', { hasText: /^Load$/ }).click();
                await idle(page);
            };
            await runView('Seattle Accounts');
            await expectNoDialog(page, 'Seattle view');
            assertEqual(await recordNames(page), ['Contoso A', 'Contoso B'], 'Seattle view');
            assert((await page.locator('.mi-records-grid thead').innerText()).includes('ADDRESS1_CITY'), 'columns follow the layoutxml');

            await runView('My Fabrikam accounts');
            assertEqual(await recordNames(page), ['Fabrikam C', 'Fabrikam D'], 'personal view');

            await runView('Accounts by city');
            const text = await takeDialog(page);
            assert(text && text.includes('Views with aggregation are not supported.'), 'aggregate view error, got: ' + text);
        });

        await test('Master / Slave selection: same record refused, swap, context menu, copy id', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await pick(page, 'Contoso A', 'master');
            await page.locator('.mi-records-footer button', { hasText: 'Set as Slave' }).click();
            const warning = await takeDialog(page);
            assert(warning && warning.includes('already the Master'), 'same record cannot be Slave');
            await pick(page, 'Contoso B', 'slave');
            assertEqual(await page.locator('.mi-chip-master .mi-chip-name').innerText(), 'Contoso A', 'master chip');
            assertEqual(await page.locator('.mi-chip-slave .mi-chip-name').innerText(), 'Contoso B', 'slave chip');
            assertEqual(await page.locator('.mi-records-grid .mi-pill').allInnerTexts(), ['MASTER', 'SLAVE'], 'role pills');

            await page.locator('.mi-records-footer button', { hasText: 'Swap' }).click();
            assertEqual(await page.locator('.mi-chip-master .mi-chip-name').innerText(), 'Contoso B', 'swapped master');

            await page.locator('.mi-records-grid tbody tr', { hasText: 'Fabrikam C' }).click({ button: 'right' });
            await page.locator('[role=menuitem]', { hasText: 'Copy record ID' }).click();
            assertEqual(await page.evaluate(() => window.__clipboard), g(103), 'copied id');
            await page.locator('.mi-records-grid tbody tr', { hasText: 'Fabrikam C' }).click({ button: 'right' });
            await page.locator('[role=menuitem]', { hasText: 'Set as Master' }).click();
            assertEqual(await page.locator('.mi-chip-master .mi-chip-name').innerText(), 'Fabrikam C', 'context menu Set as Master');
        });

        await test('Comparison: mergeable fields, smart default, filters, choices, owner', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await pick(page, 'Contoso A', 'master');
            await pick(page, 'Contoso B', 'slave');
            await compare(page);
            await expectNoDialog(page, 'compare');

            const fields = await page.locator('.mi-compare-grid td.mi-mono').allInnerTexts();
            for (const excluded of ['accountid', 'primarycontactidname', 'new_score', 'entityimage', 'revenue_base', 'masterid', 'statecode', 'statuscode', 'createdon', 'modifiedon', 'ownerid']) {
                assert(!fields.includes(excluded), `${excluded} must not be in the comparison`);
            }
            for (const included of ['name', 'telephone1', 'emailaddress1', 'numberofemployees', 'industrycode', 'creditonhold', 'primarycontactid', 'parentaccountid', 'revenue', 'description']) {
                assert(fields.includes(included), `${included} must be in the comparison`);
            }

            // Master empty / Slave filled → Slave preselected
            assert(await compareRow(page, 'emailaddress1').locator('.mi-radio-slave.mi-radio-on').count(), 'emailaddress1 preselected from the Slave');
            assert(await compareRow(page, 'telephone1').locator('.mi-radio-master.mi-radio-on').count(), 'telephone1 kept from the Master');
            assertEqual(await compareRow(page, 'industrycode').locator('td.mi-value').allInnerTexts(), ['Accounting', 'Consulting'], 'formatted choice values');
            assertEqual(await compareRow(page, 'primarycontactid').locator('td.mi-value').allInnerTexts(), ['Alice Martin', 'Bob Durand'], 'lookup names');

            const before = await stats(page);
            await page.getByLabel('Only differences').check();
            const shown = await page.locator('.mi-compare-grid tbody tr').count();
            assertEqual(String(shown), before.differences, 'only differences shows the differing rows');
            await page.getByLabel('Only differences').uncheck();

            await page.fill('.mi-card-compare .mi-search input', 'phone');
            assertEqual(await page.locator('.mi-compare-grid td.mi-mono').allInnerTexts(), ['telephone1'], 'field filter');
            await page.fill('.mi-card-compare .mi-search input', '');

            await chooseSlave(page, 'telephone1');
            assert(await compareRow(page, 'telephone1').locator('.mi-radio-slave.mi-radio-on').count(), 'click on the Slave value selects it');
            await compareRow(page, 'telephone1').focus();
            await page.keyboard.press('m');
            assert(await compareRow(page, 'telephone1').locator('.mi-radio-master.mi-radio-on').count(), 'keyboard M selects the Master');

            await page.getByLabel('Include owner (ownerid)').check();
            assert(await compareRow(page, 'ownerid').count(), 'owner shown when included');
            assert(await compareRow(page, 'emailaddress1').locator('.mi-radio-slave.mi-radio-on').count(), 'choices kept when the comparison is rebuilt');

            await page.locator('.mi-card-compare button', { hasText: 'All from Slave' }).click();
            const after = await stats(page);
            assertEqual(after.changes, after.differences, 'All from Slave: every difference will change');
        });

        await test('Manual merge with child reassignment (transaction): data is updated as chosen', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await pick(page, 'Contoso A', 'master');
            await pick(page, 'Contoso B', 'slave');
            await compare(page);
            await page.getByLabel('Include owner (ownerid)').check();
            await chooseSlave(page, 'telephone1');
            await chooseSlave(page, 'industrycode');
            await chooseSlave(page, 'numberofemployees');
            await chooseSlave(page, 'primarycontactid');
            await chooseSlave(page, 'ownerid');
            await chooseSlave(page, 'creditonhold');
            await chooseSlave(page, 'revenue'); // Slave empty → clears the Master value

            await page.getByLabel("Reassign the Slave's child records").check();
            await page.waitForSelector('.mi-relationships .fui-Checkbox');
            const relationships = await page.locator('.mi-relationships .fui-Checkbox').allInnerTexts();
            assertEqual(
                relationships.map((r) => r.replace(/\s+/g, ' ').trim()),
                ['Contact contact.parentcustomerid 2 record(s)', 'Project new_project.new_accountid 1 record(s)', 'Task task.regardingobjectid 1 record(s)'],
                'relationships with children (excluded / duplicate / self relationships removed)',
            );
            assertEqual((await stats(page)).children, '4', 'child records tile');
            await expectNoDialog(page, 'a relationship whose count fails does not block the others');
            assertEqual((await calls(page, 'executeBatch')).length, 0, 'no $batch for reads (Dataverse aborts a batch at the first failure)');

            const { confirmText, resultText } = await merge(page);
            assert(confirmText.includes("8 field(s) of the Master will take the Slave's value."), 'confirmation lists the changes:\n' + confirmText);
            assert(confirmText.includes('"Contoso B" will be deactivated (status: Inactive).'), 'confirmation shows the inactive status');
            assert(confirmText.includes('4 related record(s) will be moved to the Master'), 'confirmation shows the related records');
            assert(!/\$batch|changeset|ExecuteTransaction|MergeRequest/i.test(confirmText), 'no technical wording in the confirmation');
            assert(resultText && resultText.includes('Merge completed') && resultText.includes('"Contoso A" updated — 8 field(s) changed') && resultText.includes('4 related record(s) moved to the Master'), 'result dialog, got: ' + resultText);

            const data = await db(page);
            const master = data.account.find((r) => r.accountid === g(101));
            const slave = data.account.find((r) => r.accountid === g(102));
            assertEqual(
                { telephone1: master.telephone1, industrycode: master.industrycode, numberofemployees: master.numberofemployees, creditonhold: master.creditonhold, revenue: master.revenue, emailaddress1: master.emailaddress1, name: master.name },
                { telephone1: '222', industrycode: 3, numberofemployees: 20, creditonhold: true, revenue: null, emailaddress1: 'b@contoso.com', name: 'Contoso A' },
                'master fields',
            );
            assertEqual(master.primarycontactid, { entity: 'contact', id: g(202) }, 'master lookup bound to the Slave value');
            assertEqual(master.ownerid, { entity: 'systemuser', id: g(2) }, 'owner bound');
            assertEqual([slave.statecode, slave.statuscode], [1, 2], 'slave deactivated with the default inactive status');
            assertEqual(data.contact.filter((c) => c.parentcustomerid?.id === g(101)).length, 2, 'contacts reassigned');
            assertEqual(data.task.find((t) => t.activityid === g(301)).regardingobjectid, { entity: 'account', id: g(101) }, 'task reassigned');
            assertEqual(data.new_project[0].new_accountid, { entity: 'account', id: g(101) }, 'project reassigned (irregular entity set)');

            const transactions = await calls(page, 'executeTransaction');
            assertEqual(transactions.length, 1, 'single transaction');
            const close = await page.evaluate(() => window.__mock.calls.filter((c) => c[0].endsWith('reventClose')).map((c) => c[0]));
            assertEqual(close, ['preventClose', 'releasePreventClose'], 'tool close blocked during the merge');

            assert(!(await recordNames(page)).includes('Contoso B'), 'records reloaded after the merge: the Slave is gone');
            assertEqual(await page.locator('.mi-chip-master .mi-chip-placeholder').count(), 1, 'selection reset');
        });

        await test('Manual merge failure is rolled back (inactive child record)', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await pick(page, 'Fabrikam C', 'master');
            await pick(page, 'Fabrikam D', 'slave');
            await compare(page);
            await chooseSlave(page, 'telephone1');
            await page.getByLabel("Reassign the Slave's child records").check();
            await page.waitForSelector('.mi-relationships .fui-Checkbox');
            await page.click('.mi-merge-button');
            await page.locator('[role=dialog] button', { hasText: 'Merge now' }).click();
            await idle(page);
            const text = await takeDialog(page);
            assert(text && text.includes('Merge failed'), 'error title, got: ' + text);
            assert(text.includes('Failed during the reassignment of task'), 'failing operation identified');
            assert(text.includes('The transaction was rolled back: no changes were applied.'), 'rollback explained');
            const data = await db(page);
            assertEqual(data.account.find((r) => r.accountid === g(103)).telephone1, '333', 'master unchanged');
            assertEqual(data.account.find((r) => r.accountid === g(104)).statecode, 0, 'slave still active');
        });

        await test('Clearing a lookup with an empty Slave value', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await pick(page, 'Litware E', 'master');
            await pick(page, 'Litware F', 'slave');
            await compare(page);
            await chooseSlave(page, 'primarycontactid');
            const { resultText } = await merge(page);
            assert(resultText && resultText.includes('Merge completed'), 'success, got: ' + resultText);
            const transaction = (await calls(page, 'executeTransaction'))[0][1];
            const masterUpdate = transaction.find((r) => r.url === `accounts(${g(105)})`);
            assertEqual(masterUpdate.body, { 'primarycontactid@odata.bind': null }, 'lookup cleared with @odata.bind null');
            assertEqual((await db(page)).account.find((r) => r.accountid === g(105)).primarycontactid, null, 'master lookup cleared');
        });

        await test('Native merge (contact): Merge action with UpdateContent', async (page) => {
            await ready(page);
            await selectTable(page, 'cont', 'Contact (contact)');
            await pick(page, 'Chloé Petit', 'master');
            await pick(page, 'Chloe Petit', 'slave');
            await compare(page);
            await page.locator('.mi-choice', { hasText: 'Native merge' }).click();
            assert(await page.getByLabel("Reassign the Slave's child records").isDisabled(), 'reassignment disabled in native mode');
            await chooseSlave(page, 'telephone1');
            const { confirmText, resultText } = await merge(page);
            assert(confirmText.includes('Dataverse merge') && confirmText.includes('Dataverse moves every record related to the Slave to the Master.'), 'confirmation explains the native mode');
            assert(resultText && resultText.includes('Related records moved to the Master by Dataverse'), 'success, got: ' + resultText);
            const merges = (await calls(page, 'execute')).filter((c) => c[1].operationName === 'Merge');
            assertEqual(merges.length, 1, 'one Merge action');
            assertEqual(
                merges[0][1].parameters,
                {
                    Target: { '@odata.type': 'Microsoft.Dynamics.CRM.contact', contactid: g(203) },
                    Subordinate: { '@odata.type': 'Microsoft.Dynamics.CRM.contact', contactid: g(204) },
                    UpdateContent: { '@odata.type': 'Microsoft.Dynamics.CRM.contact', emailaddress1: 'chloe@x.com', telephone1: '0103' },
                    PerformParentingChecks: false,
                },
                'Merge parameters (smart default + chosen fields)',
            );
            const data = await db(page);
            assertEqual(data.contact.find((c) => c.contactid === g(204)).statecode, 1, 'slave deactivated by Dataverse');
            assertEqual(data.contact.find((c) => c.contactid === g(203)).telephone1, '0103', 'master updated');
        });

        await test('Native merge unavailable for other tables', async (page) => {
            await ready(page);
            await selectTable(page, 'proj', 'Project (new_project)');
            assert(await page.locator('.mi-choice', { hasText: 'Native merge' }).locator('input').isDisabled(), 'native radio disabled');
            assert((await page.locator('.mi-choice', { hasText: 'Native merge' }).innerText()).includes('Only available for account, contact, lead and incident.'), 'note shown');
        });

        await test('Options: record limit and exclusions are applied and saved', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await page.locator('.mi-header button', { hasText: 'Options' }).click();
            const dialog = page.locator('[role=dialog]', { hasText: 'Loading limits' });
            await dialog.locator('.fui-SpinButton input').fill('2');
            await dialog.locator('textarea').fill('description, telephone1');
            await dialog.locator('button', { hasText: /^OK$/ }).click();
            await page.locator('.mi-card-records button', { hasText: /^Load$/ }).click();
            await idle(page);
            assertEqual((await recordNames(page)).length, 2, 'limit applied');
            assert((await page.locator('.mi-records-footer .mi-muted').innerText()).includes('limit of 2 reached'), 'limit reached label');
            await pick(page, 'Contoso A', 'master');
            await pick(page, 'Contoso B', 'slave');
            await compare(page);
            const fields = await page.locator('.mi-compare-grid td.mi-mono').allInnerTexts();
            assert(!fields.includes('telephone1') && !fields.includes('description'), 'additional exclusions applied');
            const stored = await page.evaluate(() => window.__mock.settingsStore.settings);
            assertEqual([stored.maxRecords, stored.additionalExcludedAttributes, stored.lastEntityLogicalName], [2, 'description, telephone1', 'account'], 'settings saved');
        });

        await test('Startup: settings restored, no table preselected and no records loaded', async (page) => {
            await page.addInitScript(() => (window.__seedSettings = { settings: { language: 'fr', lastEntityLogicalName: 'contact', maxRecords: 5000 } }));
            await page.reload();
            await page.waitForSelector('.mi-header');
            await idle(page);
            assertEqual(await page.locator('.mi-card-records h2').innerText(), 'Sélection des enregistrements', 'French restored');
            assertEqual(await page.locator('.mi-table-combo input').inputValue(), '', 'no table preselected');
            assertEqual(await page.locator('.mi-records-grid').count(), 0, 'no records loaded');
            const fetches = (await calls(page, 'queryData')).filter((c) => !c[1].startsWith('teammemberships') && (c[1].includes('fetchXml=') || c[1].startsWith('EntityDefinitions(')));
            assertEqual(fetches.length, 0, 'no table metadata or data requested before a table is chosen');
        });

        await test('Sections 2 and 3 can be expanded and restored', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await page.locator('.mi-card-compare .mi-card-toggle').click();
            assert(await page.locator('.mi-card-compare').isVisible(), 'comparison visible');
            assert(!(await page.locator('.mi-card-records').isVisible()) && !(await page.locator('.mi-card-merge').isVisible()), 'other sections hidden');
            const height = (await page.locator('.mi-card-compare').boundingBox()).height;
            assert(height > 800, 'comparison uses the whole working area, got ' + height);
            assertEqual(await page.locator('.mi-card-compare .mi-card-toggle').innerText(), 'Restore', 'toggle label');
            await page.keyboard.press('Escape');
            assert(await page.locator('.mi-card-records').isVisible(), 'Escape restores the layout');

            await page.locator('.mi-card-merge .mi-card-toggle').click();
            assert(await page.locator('.mi-card-merge').isVisible() && !(await page.locator('.mi-card-compare').isVisible()), 'merge section expanded');
            await page.locator('.mi-card-merge .mi-card-toggle').click();
            assert(await page.locator('.mi-card-records').isVisible() && (await page.locator('.mi-card-compare').isVisible()), 'restored with the button');
        });

        await test('Related records panel is readable and scrolled into view', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            await pick(page, 'Contoso A', 'master');
            await pick(page, 'Contoso B', 'slave');
            await compare(page);
            await page.getByLabel("Reassign the Slave's child records").check();
            await page.waitForSelector('.mi-rel-item');
            await page.waitForTimeout(500);
            const visible = await page.evaluate(() => {
                const panel = document.querySelector('.mi-relationships').getBoundingClientRect();
                const area = document.querySelector('.mi-merge-scroll').getBoundingClientRect();
                return panel.top >= area.top - 1 && panel.top < area.bottom - 40;
            });
            assert(visible, 'panel scrolled into the visible area');
            const fontSize = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.mi-rel-name')).fontSize));
            assert(fontSize >= 14, 'relationship names are at least 14px, got ' + fontSize);
            assertEqual(await page.locator('.mi-rel-title').innerText(), 'Related records to move to the Master', 'panel title');
        });

        await test('Language switch (English ↔ French)', async (page) => {
            await ready(page);
            await page.locator('.mi-header button', { hasText: 'English' }).click();
            await page.locator('[role=menuitemradio]', { hasText: 'Français' }).click();
            assertEqual(await page.locator('.mi-card-compare h2').innerText(), 'Comparaison des champs', 'French UI');
            assertEqual(await page.evaluate(() => window.__mock.settingsStore.settings.language), 'fr', 'language saved');
        });

        await test('Dark theme of the ToolBox is applied', async (page) => {
            await page.addInitScript(() => (window.__mockTheme = 'dark'));
            await page.reload();
            await ready(page);
            assert(await page.locator('.mi-theme-dark').count(), 'dark theme class');
            const background = await page.evaluate(() => getComputedStyle(document.querySelector('.mi-card')).backgroundColor);
            assert(background !== 'rgb(255, 255, 255)', 'cards are dark, got ' + background);
        });

        await test('Changing the table: the field can be cleared, typed, navigated with the keyboard', async (page) => {
            await ready(page);
            await selectTable(page, 'acc', 'Account (account)');
            const input = page.locator('.mi-table-combo input');
            assertEqual(await input.inputValue(), 'Account (account)', 'selected table shown when closed');

            await input.click();
            assertEqual(await input.inputValue(), '', 'opening the list gives an empty search field');
            assertEqual(await page.locator('[role=option]').count(), 3, 'all tables listed');
            await page.keyboard.type('con');
            assertEqual(await input.inputValue(), 'con', 'typed text kept');
            assertEqual(await page.locator('[role=option] .mi-picker-logical').allInnerTexts(), ['contact'], 'filtered on the typed text');
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            assertEqual(await input.inputValue(), '', 'field can be cleared');
            assertEqual(await page.locator('[role=option]').count(), 3, 'clearing shows every table again');

            await page.keyboard.press('Escape');
            assertEqual(await input.inputValue(), 'Account (account)', 'Escape keeps the current table');
            assertEqual(await page.locator('[role=listbox]').count(), 0, 'list closed');

            await input.click();
            await page.keyboard.type('proj');
            await page.keyboard.press('Enter');
            await idle(page);
            assertEqual(await input.inputValue(), 'Project (new_project)', 'Enter selects the first match');
            assertEqual(await recordNames(page), ['Project B'], 'records of the new table');

            // The list opens on the current table (Project, the last one): ArrowUp moves to Contact
            await input.click();
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('ArrowUp');
            await page.keyboard.press('Enter');
            await idle(page);
            assertEqual(await input.inputValue(), 'Contact (contact)', 'arrow keys move in the list');

            await input.click();
            const box = await page.locator('.mi-picker-panel').boundingBox();
            assert(box.width >= 460, 'list is wide enough for long names, got ' + box.width);
            await page.mouse.click(1000, 600);
            assertEqual(await page.locator('[role=listbox]').count(), 0, 'click outside closes the list');
        });

        await test('Opening popups keeps the tool visible (listbox, menu, dialog)', async (page) => {
            await ready(page);
            await page.click('.mi-table-combo input');
            await page.waitForSelector('[role=listbox]');
            const covered = await page.evaluate(() => {
                const el = document.elementFromPoint(700, 500);
                return !el.closest('.mi-main');
            });
            assert(!covered, 'the records card is still visible under the open listbox');
        });
    } finally {
        await browser.close();
        await new Promise((resolve) => server.httpServer.close(resolve));
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
    if (failed.length) {
        console.log(`Screenshots of failures: ${shotsDir}`);
        process.exitCode = 1;
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
