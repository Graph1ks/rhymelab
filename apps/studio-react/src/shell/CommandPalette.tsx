import { useEffect, useMemo, useRef, useState } from 'react';

import { Dialog } from '../design-system/primitives';
import {
  commandShortcutText,
  rankStudioCommands,
  type StudioCommand,
} from '../legacy/shell';
import { useUiStore } from '../state/uiStore';
import {
  commandPaletteShortcutLabel,
  isTextEditingTarget,
  shellText,
} from './navigation';
import { Icon } from './icons';
import styles from './Shell.module.css';

function buildCommands(): StudioCommand[] {
  const state = useUiStore.getState();
  return [
    {
      id: 'studio',
      group: 'Navigation',
      label: 'Studio öffnen',
      keywords: ['studio', 'write', 'schreiben'],
      run: () => state.navigate('studio'),
    },
    {
      id: 'search',
      group: 'Navigation',
      label: 'Reimsuche öffnen',
      keywords: ['search', 'rhyme', 'reim', 'writer'],
      run: () => state.navigate('search'),
    },
    {
      id: 'library',
      group: 'Navigation',
      label: 'Meine Texte öffnen',
      keywords: ['library', 'texts', 'songs', 'bibliothek'],
      run: () => {
        state.navigate('studio');
        state.setLibraryOpen(true);
      },
    },
    {
      id: 'saved',
      group: 'Navigation',
      label: 'Merkliste öffnen',
      keywords: ['saved', 'bookmarks', 'merkliste'],
      run: () => {
        state.navigate('search');
        state.setSavedOpen(true);
      },
    },
    {
      id: 'settings',
      group: 'Ansicht',
      label: 'Einstellungen öffnen',
      keywords: ['settings', 'appearance', 'preferences'],
      run: () => state.navigate('settings'),
    },
    {
      id: 'theme',
      group: 'Ansicht',
      label: 'Light / Dark wechseln',
      keywords: ['theme', 'light', 'dark', 'appearance'],
      run: () => state.toggleTheme(),
    },
    {
      id: 'language',
      group: 'Ansicht',
      label: state.uiLanguage === 'de'
        ? 'Interface auf English'
        : 'Interface auf Deutsch',
      keywords: ['language', 'sprache', 'english', 'deutsch'],
      run: () => state.toggleUiLanguage(),
    },
  ];
}

export function CommandPalette({ showTrigger = true }: { showTrigger?: boolean }) {
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const language = useUiStore((state) => state.uiLanguage);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const commands = useMemo(
    () => buildCommands(),
    [language, open],
  );
  const ranked = useMemo(
    () => rankStudioCommands(commands, query),
    [commands, query],
  );

  const openPalette = () => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setOpen(true);
  };

  const closePalette = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => restoreFocusRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      if (
        (event.ctrlKey || event.metaKey)
        && event.shiftKey
        && event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= ranked.length) setActiveIndex(Math.max(0, ranked.length - 1));
  }, [activeIndex, ranked.length]);

  const run = async (command: StudioCommand | undefined) => {
    if (!command || command.disabled) return;
    await command.run?.();
    closePalette();
  };

  const platform = typeof navigator === 'undefined'
    ? ''
    : (((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform)
      || navigator.platform
      || navigator.userAgent);

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          className={styles.commandTrigger}
          onClick={openPalette}
          aria-label={shellText('Befehle öffnen', language)}
        >
          <Icon name="command" />
          <span>{commandPaletteShortcutLabel(platform)}</span>
        </button>
      ) : null}

      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openPalette();
          else closePalette();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.commandPopup}>
              <div className={styles.commandHeader}>
                <Icon name="search" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActiveIndex((index) => Math.min(ranked.length - 1, index + 1));
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveIndex((index) => Math.max(0, index - 1));
                    } else if (event.key === 'Enter') {
                      event.preventDefault();
                      void run(ranked[activeIndex]);
                    }
                  }}
                  placeholder={shellText('Aktion, Modus, Filter oder Einstellung …', language)}
                  aria-label={shellText('Befehle durchsuchen', language)}
                />
                <Dialog.Close className={styles.closeButton} aria-label={shellText('Zurück', language)}>
                  <Icon name="close" />
                </Dialog.Close>
              </div>

              <div className={styles.commandList} role="listbox">
                {ranked.length ? ranked.map((command, index) => (
                  <button
                    key={command.id}
                    type="button"
                    className={styles.commandItem}
                    data-active={index === activeIndex ? 'true' : 'false'}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => void run(command)}
                    role="option"
                    aria-selected={index === activeIndex}
                  >
                    <span>
                      <b>{shellText(command.label, language)}</b>
                      <small>{shellText(command.group, language)}</small>
                    </span>
                    {command.shortcut ? <kbd>{commandShortcutText(command.shortcut)}</kbd> : null}
                  </button>
                )) : (
                  <p className={styles.emptyCommand}>
                    {shellText('Kein passender Befehl.', language)}
                  </p>
                )}
              </div>

              <section className={styles.shortcutGuide} aria-label={language === 'de' ? 'Tastenkürzel' : 'Keyboard shortcuts'}>
                <header>
                  <span>{language === 'de' ? 'TASTENKÜRZEL' : 'KEYBOARD SHORTCUTS'}</span>
                  <b>Windows</b>
                  <b>macOS</b>
                </header>
                {[
                  [language === 'de' ? 'Befehle öffnen' : 'Open commands', 'Ctrl + Shift + K', '⌘ + ⇧ + K'],
                  [language === 'de' ? 'Editor: Rückgängig' : 'Editor: Undo', 'Ctrl + Z', '⌘ + Z'],
                  [language === 'de' ? 'Editor: Wiederholen' : 'Editor: Redo', 'Ctrl + Y / Ctrl + Shift + Z', '⌘ + ⇧ + Z'],
                  [language === 'de' ? 'Reimtreffer wählen' : 'Select rhyme result', '↑ / ↓', '↑ / ↓'],
                  [language === 'de' ? 'Treffer merken' : 'Save result', 'Space', 'Space'],
                  [language === 'de' ? 'Sicher einsetzen' : 'Safe insert', 'Enter', 'Enter'],
                  [language === 'de' ? 'Dialog / Befehle schließen' : 'Close dialog / commands', 'Esc', 'Esc'],
                ].map(([label, windows, mac]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <kbd>{windows}</kbd>
                    <kbd>{mac}</kbd>
                  </div>
                ))}
              </section>

              <p className={styles.commandHint}>
                {language === 'de'
                  ? 'Globale App-Shortcuts greifen absichtlich nicht während du in Textfeldern schreibst.'
                  : 'Global app shortcuts intentionally do not intercept while you are typing in text fields.'}
              </p>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
