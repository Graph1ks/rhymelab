import { useRef } from 'react';

import { Button, Popover } from '../design-system/primitives';
import { themeChoices } from '../design-system/theme';
import { useUiStore } from '../state/uiStore';
import { shellText } from './navigation';
import { Icon } from './icons';
import styles from './Shell.module.css';

export function ThemeControls() {
  const language = useUiStore((state) => state.uiLanguage);
  const themeChoice = useUiStore((state) => state.themeChoice);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const setThemeChoice = useUiStore((state) => state.setThemeChoice);
  const open = useUiStore((state) => state.quickstylesOpen);
  const setOpen = useUiStore((state) => state.setQuickstylesOpen);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const choices = themeChoices();

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 160);
  };

  return (
    <div
      className={styles.themeControls}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          cancelClose();
          setOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') scheduleClose();
      }}
    >
      <Button
        className={styles.iconButton}
        onClick={toggleTheme}
        aria-label={shellText('Light/Dark wechseln', language)}
        title={shellText('Light/Dark wechseln', language)}
      >
        <Icon name="sun" />
      </Button>

      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          cancelClose();
          setOpen(nextOpen);
        }}
      >
        <Popover.Trigger
          className={styles.themeMenuTrigger}
          data-rhymelab-control="shell.quickstyles"
          aria-label={shellText('Quickstyles öffnen', language)}
        >
          <Icon name="chevron" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} align="end">
            <Popover.Popup
              className={styles.themePopup}
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
            >
              <Popover.Title className={styles.popupTitle}>Quickstyles</Popover.Title>
              <Popover.Description className={styles.popupDescription}>
                {language === 'de'
                  ? 'Light/Dark bleibt ein Klick. Gespeicherte Custom-Slots werden übernommen.'
                  : 'Light/Dark stays one click. Saved custom slots are preserved.'}
              </Popover.Description>
              <div className={styles.themeChoiceList}>
                {choices.map((theme) => {
                  const active = themeChoice === theme.choice;
                  return (
                    <button
                      key={theme.choice}
                      type="button"
                      className={styles.themeChoice}
                      data-active={active ? 'true' : 'false'}
                      onClick={() => setThemeChoice(theme.choice)}
                    >
                      <span className={styles.themeSwatches} aria-hidden="true">
                        <i style={{ background: theme.colors.bg }} />
                        <i style={{ background: theme.colors.panel }} />
                        <i style={{ background: theme.colors.accent }} />
                        <i style={{ background: theme.colors.signal }} />
                      </span>
                      <span className={styles.themeChoiceCopy}>
                        <b>{theme.slot ? `${theme.slot === 'light' ? 'Light' : 'Dark'} · ${theme.name}` : theme.name}</b>
                        <small>
                          {theme.slot
                            ? (theme.subtitle ?? 'Studio Standard')
                            : (language === 'de' ? 'Eigener Style' : 'Custom style')}
                        </small>
                      </span>
                      <span className={styles.themeChoiceCheck} aria-hidden="true">
                        {active ? <Icon name="check" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
