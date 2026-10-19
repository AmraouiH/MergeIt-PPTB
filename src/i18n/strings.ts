/**
 * Every user-facing text of the tool, in English and French (port of Localization/Strings.cs).
 */
export type Language = 'en' | 'fr';

export const AppTitle = 'MergeIt';
export const MasterTag = 'MASTER';
export const SlaveTag = 'SLAVE';
export const AuthorName = 'Hamza AMRAOUI';

export function getStrings(language: Language) {
    const fr = language === 'fr';
    const T = (english: string, french: string) => (fr ? french : english);

    return {
        // Header
        appSubtitle: T('Merge duplicate Dataverse records — keep the Master, retire the Slave', 'Fusionnez les doublons Dataverse — conservez le Master, désactivez le Slave'),
        reloadTables: T('Reload tables', 'Recharger les entités'),
        options: 'Options',
        languageMenu: T('Language', 'Langue'),
        donate: T('Donate', 'Faire un don'),
        donateTip: T('Support the tool (PayPal)', "Soutenir l'outil (PayPal)"),
        authorTip: T('Developed by Hamza AMRAOUI (LinkedIn)', 'Développé par Hamza AMRAOUI (LinkedIn)'),
        notConnected: T('Not connected', 'Non connecté'),
        connectedTo: (name: string) => T(`Connected to ${name}`, `Connecté à ${name}`),

        // Cards
        stepRecordsTitle: T('Select records', 'Sélection des enregistrements'),
        stepRecordsSubtitle: T('Choose a table, load its active records, then pick a Master and a Slave', 'Choisissez une entité, chargez ses enregistrements actifs, puis désignez un Master et un Slave'),
        stepCompareTitle: T('Compare fields', 'Comparaison des champs'),
        stepCompareSubtitle: T('For each field, choose the value the Master will keep', 'Pour chaque champ, choisissez la valeur que gardera le Master'),
        stepMergeTitle: T('Merge', 'Fusion'),
        stepMergeSubtitle: T('Choose a mode, review, then run', 'Choisissez un mode, vérifiez, puis lancez'),

        // Records
        tableLabel: T('Table', 'Entité'),
        tablePlaceholder: T('Choose a table…', 'Choisissez une entité…'),
        tableCount: (shown: number, total: number) => T(`${shown} / ${total} table(s)`, `${shown} / ${total} entité(s)`),
        noTableMatch: T('No table matches the search', 'Aucune entité ne correspond à la recherche'),
        refineSearch: (more: number) => T(`… and ${more} more: refine the search`, `… et ${more} de plus : affinez la recherche`),
        filterTablesTip:T('Type to filter the table list (display name or logical name)', "Tapez pour filtrer la liste des entités (nom d'affichage ou nom logique)"),
        viewLabel: T('View', 'Vue'),
        defaultView: T('(Active records — default load)', '(Enregistrements actifs — chargement par défaut)'),
        systemViewPrefix: T('[System] ', '[Système] '),
        personalViewPrefix: T('[Personal] ', '[Personnelle] '),
        defaultViewSuffix: T(' (default)', ' (par défaut)'),
        viewsTip: T('Default load or run a system / personal view (active records only)', "Chargement par défaut ou exécution d'une vue système / personnelle (enregistrements actifs uniquement)"),
        load: T('Load', 'Charger'),
        searchCue: T('Search records…', 'Rechercher…'),
        searchBoxTip: T('Instant filter on loaded rows. Press Enter or click Search for a server-side search (contains)', 'Filtre instantané sur les lignes chargées. Entrée ou « Rechercher » : recherche côté serveur (contient)'),
        search: T('Search', 'Rechercher'),
        searchButtonTip: T("Server-side search (like '%text%') on the primary name and the selected search fields", "Recherche côté serveur (like '%texte%') sur le nom principal et les champs de recherche choisis"),
        searchFields: T('Search fields…', 'Champs de recherche…'),
        sourceActive: T('Active records', 'Enregistrements actifs'),
        sourceSearch: (text: string) => T(`Search "${text}"`, `Recherche « ${text} »`),
        sourceView: (name: string) => T(`View "${name}"`, `Vue « ${name} »`),
        recordCount: (source: string, count: number) => T(`${source}: ${count} record(s)`, `${source} : ${count} enregistrement(s)`),
        limitReached: (max: number) => T(` — limit of ${max} reached (see Options)`, ` — limite de ${max} atteinte (voir Options)`),
        setAsMaster: T('Set as Master', 'Définir comme Master'),
        setAsSlave: T('Set as Slave', 'Définir comme Slave'),
        swap: T('Swap', 'Inverser'),
        swapTip: T('Swap Master and Slave', 'Inverser Master et Slave'),
        swapMenu: T('Swap Master/Slave', 'Inverser Master/Slave'),
        copyId: T('Copy record ID', "Copier l'identifiant"),
        copied: T('Record ID copied to the clipboard', "Identifiant copié dans le presse-papiers"),
        compare: T('Compare', 'Comparer'),
        compareTip: T('Retrieves both records and compares their fields', 'Récupère les deux enregistrements et compare leurs champs'),
        chipNone: T('none selected', 'aucun'),
        roleColumn: T('Role', 'Rôle'),
        emptyRecordsNoTable: T('Choose a table to load its active records', 'Choisissez une entité pour charger ses enregistrements actifs'),
        emptyRecords: T('No records', 'Aucun enregistrement'),
        alreadySlave: T('This record is already the Slave. Master and Slave must be different.\nUse "Swap" to exchange the roles.', 'Cet enregistrement est déjà le Slave. Le Master et le Slave doivent être différents.\nUtilisez « Inverser » pour échanger les rôles.'),
        alreadyMaster: T('This record is already the Master. Master and Slave must be different.\nUse "Swap" to exchange the roles.', 'Cet enregistrement est déjà le Master. Le Master et le Slave doivent être différents.\nUtilisez « Inverser » pour échanger les rôles.'),
        inactiveRecords: T('Only active records can be merged. Inactive record(s):', 'Seuls des enregistrements actifs peuvent être fusionnés. Enregistrement(s) inactif(s) :'),

        // Comparison
        allFromMaster: T('All from Master', 'Tout depuis le Master'),
        allFromSlave: T('All from Slave', 'Tout depuis le Slave'),
        allFromMasterTip: T('Keeps the Master value for every displayed row', 'Retient la valeur Master pour toutes les lignes affichées'),
        allFromSlaveTip: T('Takes the Slave value for every displayed row (an empty Slave value clears the Master field)', 'Retient la valeur Slave pour toutes les lignes affichées (une valeur Slave vide videra le champ du Master)'),
        onlyDifferences: T('Only differences', 'Uniquement les différences'),
        hideEmpty: T('Hide empty on both sides', 'Masquer les champs vides des deux côtés'),
        filterFieldsCue: T('Filter fields…', 'Filtrer les champs…'),
        includeOwner: T('Include owner (ownerid)', 'Inclure le propriétaire (ownerid)'),
        colDisplayName: T('Display name', "Nom d'affichage"),
        colLogicalName: T('Logical name', 'Nom logique'),
        colMaster: 'Master',
        colMasterValue: T('Master value', 'Valeur Master'),
        colSlave: 'Slave',
        colSlaveValue: T('Slave value', 'Valeur Slave'),
        choiceTip: T('Click a value (or its dot) to choose which one the Master keeps. Keyboard: M = Master, S = Slave', 'Cliquez sur une valeur (ou sa pastille) pour choisir celle que garde le Master. Clavier : M = Master, S = Slave'),
        emptyComparison: T('Pick a Master and a Slave, then click Compare', 'Désignez un Master et un Slave, puis cliquez sur Comparer'),

        // Merge
        modeManualTitle: T('Transaction (manual)', 'Transaction (manuel)'),
        modeManualDescription: T(
            'The chosen values are copied to the Master and the Slave is deactivated in a single step: if anything fails, nothing is changed.',
            "Les valeurs choisies sont copiées sur le Master et le Slave est désactivé en une seule étape : en cas d'erreur, rien n'est modifié.",
        ),
        modeNativeTitle: T('Native merge (Dataverse)', 'Fusion native (Dataverse)'),
        modeNativeDescription: T(
            'Dataverse updates the Master, moves every record related to the Slave (activities, notes, contacts…) and deactivates the Slave.',
            'Dataverse met à jour le Master, déplace tous les enregistrements liés au Slave (activités, notes, contacts…) et désactive le Slave.',
        ),
        modeNativeUnavailable: T('Only available for account, contact, lead and incident.', 'Disponible uniquement pour account, contact, lead et incident.'),
        reassignChildren: T("Reassign the Slave's child records", 'Réaffecter les enfants du Slave'),
        reassignTip: T(
            'The records linked to the Slave through the checked relationships are moved to the Master, in the same step as the merge.',
            'Les enregistrements liés au Slave par les relations cochées sont déplacés vers le Master, dans la même étape que la fusion.',
        ),
        reassignTitle: T('Related records to move to the Master', 'Enregistrements liés à déplacer vers le Master'),
        reassignHint: T('Uncheck a relationship to leave its records on the Slave.', 'Décochez une relation pour laisser ses enregistrements sur le Slave.'),
        noChildren: T('No related record is linked to the Slave.', "Aucun enregistrement lié n'est rattaché au Slave."),
        recordsBadge: (count: number) => T(`${count} record(s)`, `${count} enreg.`),
        statFields: T('Fields', 'Champs'),
        statDifferences: T('Differences', 'Différences'),
        statChanges: T('Will change', 'À modifier'),
        statChildren: T('Related records', 'Enreg. liés'),
        mergeButton: T('Merge records', 'Fusionner'),
        mergeFailedTitle: T('Merge failed', 'Échec de la fusion'),
        mergeSuccessTitle: T('Merge completed', 'Fusion terminée'),
        expand: T('Expand', 'Agrandir'),
        restore: T('Restore', 'Réduire'),

        // Loading messages / errors
        loadingTables: T('Loading tables…', 'Chargement de la liste des entités…'),
        loadingMetadata: (name: string) => T(`Loading metadata and views of "${name}"…`, `Chargement des métadonnées et des vues de « ${name} »…`),
        loadingActive: (name: string) => T(`Loading active records of "${name}"…`, `Chargement des enregistrements actifs de « ${name} »…`),
        searching: (text: string) => T(`Searching "${text}"…`, `Recherche de « ${text} »…`),
        runningView: (name: string) => T(`Running view "${name}"…`, `Exécution de la vue « ${name} »…`),
        recordsLoaded: (count: number) => T(`${count} record(s) loaded`, `${count} enregistrement(s) chargé(s)`),
        retrievingForCompare: T('Retrieving Master, Slave and metadata…', 'Récupération du Master, du Slave et des métadonnées…'),
        lookingForChildren: T("Looking for the Slave's child records…", 'Recherche des enregistrements enfants du Slave…'),
        merging: T('Merging…', 'Fusion en cours…'),

        errLoadTables: T('Unable to load the table list', 'Impossible de charger la liste des entités'),
        errLoadMetadata: (name: string) => T(`Unable to load the metadata of "${name}"`, `Impossible de charger les métadonnées de « ${name} »`),
        errLoadRecords: T('Error while loading records', 'Erreur lors du chargement des enregistrements'),
        errRetrieveCompare: T('Unable to retrieve the records to compare', 'Impossible de récupérer les enregistrements à comparer'),
        errCountChildren: T('Unable to count child records', 'Impossible de compter les enregistrements enfants'),
        errPrepareMerge: T('Unable to prepare the merge', 'Impossible de préparer la fusion'),

        // Services
        errNoStateCode: (entity: string) => T(`Table ${entity} has no statecode attribute.`, `L'entité ${entity} n'a pas d'attribut statecode.`),
        errNoInactiveState: (entity: string) => T(`Table ${entity} has no inactive state (statecode = 1).`, `L'entité ${entity} n'a pas d'état inactif (statecode = 1).`),
        errNoDefaultStatus: (entity: string) => T(`No default status is defined for the inactive state of ${entity}.`, `Aucun statut par défaut n'est défini pour l'état inactif de ${entity}.`),
        errAggregateView: T('Views with aggregation are not supported.', 'Les vues avec agrégation ne sont pas prises en charge.'),
        errInvalidFetch: T('Invalid view FetchXML.', 'FetchXML de la vue invalide.'),
        errInvalidFetchEntity: T('Invalid view FetchXML (missing entity element).', 'FetchXML de la vue invalide (élément entity manquant).'),
        errNoNavigationProperty: (attribute: string) =>
            T(`Unable to find the navigation property of the lookup "${attribute}".`, `Impossible de trouver la propriété de navigation du lookup « ${attribute} ».`),

        progressNativeMerge: T('Dataverse merge in progress…', 'Fusion Dataverse en cours…'),
        progressChildLookup: (name: string) => T(`Looking up child records: ${name}…`, `Recherche des enregistrements enfants : ${name}…`),
        progressTransaction: (count: number) => T(`Running the transaction (${count} operation(s))…`, `Exécution de la transaction (${count} opération(s))…`),
        progressTransactionBatch: (index: number, total: number) => T(`Running transaction ${index}/${total}…`, `Exécution de la transaction ${index}/${total}…`),

        opReassign: (entity: string, id: string, attribute: string) => T(`reassignment of ${entity} ${id} (${attribute})`, `réaffectation de ${entity} ${id} (${attribute})`),
        opUpdateMaster: (name: string) => T(`update of the Master "${name}"`, `mise à jour du Master « ${name} »`),
        opDeactivateSlave: (name: string) => T(`deactivation of the Slave "${name}"`, `désactivation du Slave « ${name} »`),
        failedDuring: (operation: string, message: string) => T(`Failed during the ${operation}:\n${message}`, `Échec lors de la ${operation} :\n${message}`),
        transactionFailed: (message: string) => T(`The transaction failed:\n${message}`, `La transaction a échoué :\n${message}`),
        rolledBack: T('\n\nThe transaction was rolled back: no changes were applied.', "\n\nLa transaction a été annulée : aucune modification n'a été appliquée."),
        partiallyCommitted: (index: number, total: number, previous: number) =>
            T(
                `\n\nTransaction ${index}/${total} was rolled back, but the ${previous} previous transaction(s) (child reassignments) were already committed.`,
                `\n\nLa transaction ${index}/${total} a été annulée, mais les ${previous} transaction(s) précédente(s) (réaffectations d'enfants) ont déjà été validées.`,
            ),
        nativeMergeFailed: (message: string) => T(`The native merge failed: ${message}`, `La fusion native a échoué : ${message}`),
        countFailed: (relationship: string, message: string) => T(`${relationship}: count failed (${message})`, `${relationship} : comptage impossible (${message})`),

        yes: T('Yes', 'Oui'),
        no: T('No', 'Non'),

        // Dialogs
        ok: 'OK',
        cancel: T('Cancel', 'Annuler'),
        empty: T('(empty)', '(vide)'),
        warning: T('Warning', 'Avertissement'),
        error: T('Error', 'Erreur'),

        confirmTitle: T('Confirm the merge', 'Confirmer la fusion'),
        confirmSubtitle: T('Check what will happen before you merge.', 'Vérifiez ce qui va se passer avant de fusionner.'),
        confirmKept: T('Kept', 'Conservé'),
        confirmDeactivated: T('Deactivated', 'Désactivé'),
        tileFieldsUpdated: T('Fields updated', 'Champs mis à jour'),
        tileRelatedMoved: T('Related records moved', 'Enregistrements liés déplacés'),
        tileMethod: T('Merge method', 'Méthode'),
        methodTransaction: T('Single transaction', 'Transaction unique'),
        methodNative: T('Dataverse merge', 'Fusion Dataverse'),
        relatedAll: T('All', 'Tous'),
        whatHappens: T('What will happen', 'Ce qui va se passer'),
        stepFields: (count: number) =>
            count === 0
                ? T('No field of the Master will change.', 'Aucun champ du Master ne sera modifié.')
                : T(`${count} field(s) of the Master will take the Slave's value.`, `${count} champ(s) du Master prendront la valeur du Slave.`),
        stepChildren: (count: number) => T(`${count} related record(s) will be moved to the Master:`, `${count} enregistrement(s) lié(s) seront déplacés vers le Master :`),
        stepNoChildren: T('Related records stay linked to the Slave.', 'Les enregistrements liés restent rattachés au Slave.'),
        stepNativeChildren: T('Dataverse moves every record related to the Slave to the Master.', 'Dataverse déplace tous les enregistrements liés au Slave vers le Master.'),
        stepDeactivate: (name: string, status: string) => T(`"${name}" will be deactivated (status: ${status}).`, `« ${name} » sera désactivé (statut : ${status}).`),
        stepNativeDeactivate: (name: string) => T(`"${name}" will be deactivated and linked to the Master.`, `« ${name} » sera désactivé et rattaché au Master.`),
        stepAtomic: T('All changes are applied together: if one fails, nothing is changed.', "Toutes les modifications sont appliquées ensemble : si l'une échoue, rien n'est modifié."),
        confirmBatchWarning: (max: number) =>
            T(
                `There are more than ${max} changes: related records will be moved in several steps. If a step fails, the previous steps stay applied.`,
                `Il y a plus de ${max} modifications : les enregistrements liés seront déplacés en plusieurs étapes. Si une étape échoue, les précédentes restent appliquées.`,
            ),
        changesTitle: T('Field changes', 'Modifications des champs'),
        irreversible: T("This action can't be undone.", 'Cette action est irréversible.'),
        mergeNow: T('Merge now', 'Fusionner maintenant'),
        resultMasterUpdated: (name: string, count: number) => T(`"${name}" updated — ${count} field(s) changed`, `« ${name} » mis à jour — ${count} champ(s) modifié(s)`),
        resultSlaveDeactivated: (name: string) => T(`"${name}" deactivated`, `« ${name} » désactivé`),
        resultChildren: (count: number) => T(`${count} related record(s) moved to the Master`, `${count} enregistrement(s) lié(s) déplacé(s) vers le Master`),
        resultNativeChildren: T('Related records moved to the Master by Dataverse', 'Enregistrements liés déplacés vers le Master par Dataverse'),
        done: T('Done', 'Terminé'),
        colField: T('Field', 'Champ'),
        colCurrentValue: T('Current value', 'Valeur actuelle'),
        colNewValue: T('New value', 'Nouvelle valeur'),

        optionsSubtitle: T('Loading limits and comparison rules', 'Limites de chargement et règles de comparaison'),
        optSectionLoading: T('LOADING', 'CHARGEMENT'),
        optSectionComparison: T('COMPARISON', 'COMPARAISON'),
        optOnlyReadWrite: T('Only show tables I can read and write (Read + Write privileges)', 'Afficher uniquement les entités que je peux lire et modifier (privilèges Read + Write)'),
        privilegeCheckFailed: (message: string) =>
            T(`Unable to check your privileges, all tables are shown: ${message}`, `Impossible de vérifier vos privilèges, toutes les entités sont affichées : ${message}`),
        noReadWriteTable: T('no table matched your Read + Write privileges', 'aucune entité ne correspond à vos privilèges Read + Write'),
        optMaxRecords:T('Maximum number of records loaded', "Nombre maximal d'enregistrements chargés"),
        optSmartDefault: T('Pre-select the Slave value when the Master is empty and the Slave is filled', 'Pré-cocher la valeur Slave quand le Master est vide et le Slave renseigné'),
        optIncludeCurrency: T('Include the currency (transactioncurrencyid) in the comparison', 'Inclure la devise (transactioncurrencyid) dans la comparaison'),
        optExcluded: T('Additional attributes to exclude (comma-separated)', 'Attributs supplémentaires à exclure (séparés par des virgules)'),
        optAlwaysExcluded: (list: string) => T(`Always excluded: ${list}, primary key, *_base.`, `Toujours exclus : ${list}, clé primaire, *_base.`),

        searchFieldsTitle: T('Search fields', 'Champs de recherche'),
        searchFieldsSubtitle: T('Text fields used by the server-side search', 'Champs texte utilisés par la recherche serveur'),
        searchFieldsInfo: T(
            'The primary name is always searched. Check additional text fields to include (they are also shown in the grid).',
            'Le nom principal est toujours utilisé. Cochez les champs texte supplémentaires à inclure (ils seront aussi affichés dans la grille).',
        ),
    };
}

export type Strings = ReturnType<typeof getStrings>;
