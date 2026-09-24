import { useEffect, useMemo, useRef, useState } from 'react';

import { Dialog } from '../design-system/primitives';
import {
  commandShortcutText,
  rankStudioCommands,
  type StudioCommand,
} from '../legacy/shell';
import { useUiStore } from '../state/uiStore';
import { shellText } from './navigation';
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
      shortcut: 'Alt+1',
      run: () => state.navigate('studio'),
    },
    {
      id: 'search',
      group: 'Navigation',
      label: 'Reimsuche öffnen',
      keywords: ['search', 'rhyme', 'reim', 'writer'],
      shortcut: 'Alt+2',
      run: () => state.navigate('search'),
    },
    {
      id: 'library',
      group: 'Navigation',
      label: 'Meine Texte öffnen',
      keywords: ['library', 'texts', 'songs', 'bibliothek'],
      run: () => state.navigate('library'),
    },
    {
      id: 'saved',
      group: 'Navigation',
      label: 'Merkliste öffnen',
      keywords: ['saved', 'bookmarks', 'merkliste'],
      run: () => state.navigate('saved'),
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

export function CommandPalette() {
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
      if (event.altKey && event.key === '1') {
        event.preventDefault();
        useUiStore.getState().navigate('studio');
      }
      if (event.altKey && event.key === '2') {
        event.preventDefault();
        useUiStore.getState().navigate('search');
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

  return (
    <>
      <button
        type="button"
        className={styles.commandTrigger}
        onClick={openPalette}
        aria-label={shellText('Befehle öffnen', language)}
      >
        <Icon name="command" />
        <span>⌘ K</span>
      </button>

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

              <p className={styles.commandHint}>
                {shellText('Strg / ⌘ + K öffnet die Palette · ↑↓ wählen · Enter ausführen · Escape schließen.', language)}
              </p>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
