import { Button, Menu, MenuItemRadio, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components';
import { ArrowClockwiseRegular, GlobeRegular, HeartFilled, PersonRegular, SettingsRegular } from '@fluentui/react-icons';
import logo from '../assets/logo.png';
import { useStrings } from '../i18n/I18nContext';
import { AppTitle, AuthorName, type Language } from '../i18n/strings';

const LinkedInUrl = 'https://www.linkedin.com/in/hamza-amraoui/';
const DonateUrl = 'https://www.paypal.com/paypalme/EntityFieldsAnalyser';

/** Opens an external page (falls back to the connection browser when the host blocks window.open). */
async function openUrl(url: string) {
    try {
        const opened = window.open(url, '_blank', 'noopener');
        if (!opened) await window.toolboxAPI.utils.openInConnectionBrowser(url);
    } catch (error) {
        console.error(`MergeIt: unable to open ${url}`, error);
    }
}

interface HeaderProps {
    connectionName?: string | null;
    language: Language;
    busy: boolean;
    onReloadTables: () => void;
    onOptions: () => void;
    onLanguage: (language: Language) => void;
}

/**
 * Gradient header: logo, title, connection, toolbar (port of the ToolStrip header).
 */
export function Header(props: HeaderProps) {
    const strings = useStrings();

    return (
        <header className="mi-header">
            <div className="mi-brand">
                <img src={logo} alt="" className="mi-logo" />
                <div>
                    <div className="mi-title">{AppTitle}</div>
                    <div className="mi-subtitle">{strings.appSubtitle}</div>
                </div>
            </div>

            <div className="mi-header-tools">
                <span className={props.connectionName ? 'mi-connection mi-connection-on' : 'mi-connection'}>
                    {props.connectionName ? `● ${strings.connectedTo(props.connectionName)}` : `○ ${strings.notConnected}`}
                </span>

                <Button appearance="transparent" className="mi-header-button" icon={<ArrowClockwiseRegular />} onClick={props.onReloadTables} disabled={props.busy}>
                    {strings.reloadTables}
                </Button>
                <Button appearance="transparent" className="mi-header-button" icon={<SettingsRegular />} onClick={props.onOptions} disabled={props.busy}>
                    {strings.options}
                </Button>

                <Menu checkedValues={{ language: [props.language] }} onCheckedValueChange={(_e, data) => props.onLanguage(data.checkedItems[0] as Language)}>
                    <MenuTrigger disableButtonEnhancement>
                        <Button appearance="transparent" className="mi-header-button" icon={<GlobeRegular />} title={strings.languageMenu}>
                            {props.language === 'fr' ? 'Français' : 'English'}
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItemRadio name="language" value="en">
                                English
                            </MenuItemRadio>
                            <MenuItemRadio name="language" value="fr">
                                Français
                            </MenuItemRadio>
                        </MenuList>
                    </MenuPopover>
                </Menu>

                <Button appearance="transparent" className="mi-header-button" icon={<PersonRegular />} title={strings.authorTip} onClick={() => openUrl(LinkedInUrl)}>
                    {AuthorName}
                </Button>
                <Button appearance="transparent" className="mi-header-button" icon={<HeartFilled className="mi-heart" />} title={strings.donateTip} onClick={() => openUrl(DonateUrl)}>
                    {strings.donate}
                </Button>
            </div>
        </header>
    );
}
