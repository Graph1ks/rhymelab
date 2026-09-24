import { Button, Select } from '../design-system/primitives';
import { DataSafetyPanel } from '../features/library/DataSafetyPanel';
import { SystemAcceptancePanel } from '../features/system/SystemAcceptancePanel';
import { themeChoices } from '../design-system/theme';
import type { StudioUiLanguage } from '../legacy/shell';
import { useUiStore } from '../state/uiStore';
import { shellText } from './navigation';
import { Icon } from './icons';
import styles from './Shell.module.css';

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const language = useUiStore((state) => state.uiLanguage);
  const setLanguage = useUiStore((state) => state.setUiLanguage);
  const themeChoice = useUiStore((state) => state.themeChoice);
  const setThemeChoice = useUiStore((state) => state.setThemeChoice);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const openCommands = useUiStore((state) => state.setCommandPaletteOpen);
  const choices = themeChoices();

  const languageItems = [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ] as const;

  return (
    <div className={compact ? styles.settingsCompact : styles.settingsGrid}>
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardHead}>
          <span className={styles.settingsIcon}><Icon name="language" /></span>
          <div>
            <p className={styles.kicker}>{language === 'de' ? 'SPRACHE' : 'LANGUAGE'}</p>
            <h2>{language === 'de' ? 'Oberfläche' : 'Interface'}</h2>
          </div>
        </div>
        <p className={styles.settingsCopy}>
          {language === 'de'
            ? 'Die bestehende DE/EN-Präferenz bleibt im Studio-Preference-Store.'
            : 'The existing DE/EN preference stays in the Studio preference store.'}
        </p>

        <Select.Root
          items={languageItems}
          value={language}
          onValueChange={(value) => {
            if (value === 'de' || value === 'en') setLanguage(value as StudioUiLanguage);
          }}
        >
          <Select.Label className={styles.fieldLabel}>
            {language === 'de' ? 'Interface-Sprache' : 'Interface language'}
          </Select.Label>
          <Select.Trigger className={styles.selectTrigger}>
            <Select.Value />
            <Select.Icon><Icon name="chevron" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className={styles.selectPositioner} sideOffset={6} alignItemWithTrigger={false}>
              <Select.Popup className={styles.selectPopup}>
                {languageItems.map((item) => (
                  <Select.Item key={item.value} value={item.value} className={styles.selectItem}>
                    <Select.ItemIndicator className={styles.selectIndicator}>
                      <Icon name="check" />
                    </Select.ItemIndicator>
                    <Select.ItemText>{item.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.settingsCardHead}>
          <span className={styles.settingsIcon}><Icon name="sun" /></span>
          <div>
            <p className={styles.kicker}>{language === 'de' ? 'APPEARANCE' : 'APPEARANCE'}</p>
            <h2>Light / Dark</h2>
          </div>
        </div>
        <p className={styles.settingsCopy}>
          {language === 'de'
            ? 'Der Hauptschalter wechselt weiterhin zwischen den konfigurierten Light- und Dark-Slots.'
            : 'The main switch still toggles between the configured Light and Dark slots.'}
        </p>
        <div className={styles.themeSettingsList}>
          {choices.map((theme) => (
            <button
              key={theme.choice}
              type="button"
              className={styles.themeSettingsChoice}
              data-active={themeChoice === theme.choice ? 'true' : 'false'}
              onClick={() => setThemeChoice(theme.choice)}
            >
              <span className={styles.themeSwatches} aria-hidden="true">
                <i style={{ background: theme.colors.bg }} />
                <i style={{ background: theme.colors.panel }} />
                <i style={{ background: theme.colors.accent }} />
                <i style={{ background: theme.colors.signal }} />
              </span>
              <span>
                <b>{theme.name}</b>
                <small>{theme.slot ?? theme.mode}</small>
              </span>
              {themeChoice === theme.choice ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>
        <Button className={styles.secondaryButton} onClick={toggleTheme}>
          <Icon name="sun" />
          {shellText('Light / Dark wechseln', language)}
        </Button>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.settingsCardHead}>
          <span className={styles.settingsIcon}><Icon name="command" /></span>
          <div>
            <p className={styles.kicker}>COMMANDS</p>
            <h2>{shellText('Befehle', language)}</h2>
          </div>
        </div>
        <p className={styles.settingsCopy}>
          {language === 'de'
            ? 'Die Palette nutzt weiterhin das bestehende normalisierte Ranking. Weitere Fachbefehle kommen mit ihren jeweiligen Port-Phasen.'
            : 'The palette keeps the existing normalized ranking. Domain commands arrive with their respective port phases.'}
        </p>
        <Button className={styles.secondaryButton} onClick={() => openCommands(true)}>
          <Icon name="command" />
          {shellText('Befehle öffnen', language)}
          <kbd>Ctrl / ⌘ + K</kbd>
        </Button>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.settingsCardHead}>
          <span className={styles.settingsIcon}><Icon name="grid" /></span>
          <div>
            <p className={styles.kicker}>DATA SAFETY</p>
            <h2>{language === 'de' ? 'Lokale Daten' : 'Local data'}</h2>
          </div>
        </div>
        <p className={styles.settingsCopy}>
          {language === 'de'
            ? 'Recovery, portabler Import/Export und der autoritative IndexedDB-Status laufen über denselben bestehenden DocumentStore.'
            : 'Recovery, portable import/export and authoritative IndexedDB status use the same existing DocumentStore.'}
        </p>
        <DataSafetyPanel />
      </section>

      <SystemAcceptancePanel />
    </div>
  );
}
