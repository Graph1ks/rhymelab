import { DataSafetyPanel } from '../features/library/DataSafetyPanel';
import { useUiStore } from '../state/uiStore';
import { Icon } from './icons';
import { StyleDesigner } from './StyleDesigner';
import styles from './Shell.module.css';

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const language = useUiStore((state) => state.uiLanguage);

  return (
    <div className={styles.settingsWorkspace} data-compact={compact ? 'true' : 'false'}>
      <StyleDesigner />

      <section className={styles.settingsSafety}>
        <div className={styles.settingsSafetyHead}>
          <span className={styles.settingsIcon}><Icon name="grid" /></span>
          <div>
            <p className={styles.kicker}>DATA SAFETY</p>
            <h2>{language === 'de' ? 'Backup & lokale Daten' : 'Backup & local data'}</h2>
            <p>
              {language === 'de'
                ? 'Recovery, Import und Export bleiben am autoritativen IndexedDB-DocumentStore.'
                : 'Recovery, import and export remain attached to the authoritative IndexedDB DocumentStore.'}
            </p>
          </div>
        </div>
        <DataSafetyPanel />
      </section>
    </div>
  );
}
