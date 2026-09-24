import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { Dialog } from '../../design-system/primitives';
import { useUiStore } from '../../state/uiStore';
import { Icon } from '../../shell/icons';
import styles from './Editor.module.css';

export interface CuratedGoogleFont {
  family: string;
  category: string;
  note: string;
  fallback: 'serif' | 'sans-serif' | 'monospace' | 'cursive';
}

export const DEFAULT_EDITOR_FONT = 'google:Oranienbaum';

export const CURATED_GOOGLE_FONTS: readonly CuratedGoogleFont[] = Object.freeze([
  { family: 'Inter', category: 'Modern Sans', note: 'Neutral · crisp · UI-clean', fallback: 'sans-serif' },
  { family: 'Manrope', category: 'Modern Sans', note: 'Wide · contemporary · calm', fallback: 'sans-serif' },
  { family: 'DM Sans', category: 'Modern Sans', note: 'Friendly · readable · balanced', fallback: 'sans-serif' },
  { family: 'Plus Jakarta Sans', category: 'Modern Sans', note: 'Polished · geometric · premium', fallback: 'sans-serif' },
  { family: 'Space Grotesk', category: 'Modern Sans', note: 'Technical · editorial · character', fallback: 'sans-serif' },

  { family: 'Outfit', category: 'Geometric', note: 'Clean · modern · compact', fallback: 'sans-serif' },
  { family: 'Sora', category: 'Geometric', note: 'Sharp · future-facing · precise', fallback: 'sans-serif' },
  { family: 'Urbanist', category: 'Geometric', note: 'Smooth · contemporary · open', fallback: 'sans-serif' },
  { family: 'Montserrat', category: 'Geometric', note: 'Architectural · strong · familiar', fallback: 'sans-serif' },
  { family: 'Poppins', category: 'Geometric', note: 'Round · graphic · confident', fallback: 'sans-serif' },

  { family: 'Oranienbaum', category: 'Editorial Serif', note: 'Default · elegant · literary', fallback: 'serif' },
  { family: 'Lora', category: 'Editorial Serif', note: 'Readable · lyrical · warm', fallback: 'serif' },
  { family: 'Libre Baskerville', category: 'Editorial Serif', note: 'Classic · sturdy · long-form', fallback: 'serif' },
  { family: 'Cormorant Garamond', category: 'Editorial Serif', note: 'High-fashion · delicate · expressive', fallback: 'serif' },
  { family: 'Merriweather', category: 'Editorial Serif', note: 'Robust · bookish · screen-friendly', fallback: 'serif' },

  { family: 'Bodoni Moda', category: 'Magazine', note: 'Fashion · contrast · dramatic', fallback: 'serif' },
  { family: 'Fraunces', category: 'Magazine', note: 'Variable · expressive · retro-modern', fallback: 'serif' },
  { family: 'DM Serif Display', category: 'Magazine', note: 'Bold editorial · classy · spacious', fallback: 'serif' },
  { family: 'Prata', category: 'Magazine', note: 'Luxury · sharp · headline-led', fallback: 'serif' },
  { family: 'Playfair Display', category: 'Magazine', note: 'Classic magazine · high contrast', fallback: 'serif' },

  { family: 'EB Garamond', category: 'Book', note: 'Literary · historic · fluid', fallback: 'serif' },
  { family: 'Crimson Pro', category: 'Book', note: 'Professional · quiet · long-form', fallback: 'serif' },
  { family: 'Spectral', category: 'Book', note: 'Contemporary serif · dense text', fallback: 'serif' },
  { family: 'Alegreya', category: 'Book', note: 'Humanist · rhythmic · expressive', fallback: 'serif' },
  { family: 'Literata', category: 'Book', note: 'Reading-first · literary · modern', fallback: 'serif' },

  { family: 'Bebas Neue', category: 'Condensed / Poster', note: 'Tall · bold · poster', fallback: 'sans-serif' },
  { family: 'Oswald', category: 'Condensed / Poster', note: 'Newsroom · condensed · assertive', fallback: 'sans-serif' },
  { family: 'Anton', category: 'Condensed / Poster', note: 'Heavy · loud · headline', fallback: 'sans-serif' },
  { family: 'Archivo Narrow', category: 'Condensed / Poster', note: 'Utility · compact · readable', fallback: 'sans-serif' },
  { family: 'Roboto Condensed', category: 'Condensed / Poster', note: 'Efficient · familiar · clean', fallback: 'sans-serif' },

  { family: 'Figtree', category: 'Humanist Sans', note: 'Fresh · natural · highly readable', fallback: 'sans-serif' },
  { family: 'Work Sans', category: 'Humanist Sans', note: 'Practical · warm · balanced', fallback: 'sans-serif' },
  { family: 'Source Sans 3', category: 'Humanist Sans', note: 'Professional · versatile · clear', fallback: 'sans-serif' },
  { family: 'Nunito Sans', category: 'Humanist Sans', note: 'Soft · approachable · legible', fallback: 'sans-serif' },
  { family: 'Mulish', category: 'Humanist Sans', note: 'Minimal · relaxed · modern', fallback: 'sans-serif' },

  { family: 'JetBrains Mono', category: 'Mono / Tech', note: 'Dense · technical · exceptionally clear', fallback: 'monospace' },
  { family: 'IBM Plex Mono', category: 'Mono / Tech', note: 'Industrial · editorial · technical', fallback: 'monospace' },
  { family: 'Space Mono', category: 'Mono / Tech', note: 'Retro-tech · distinctive · wide', fallback: 'monospace' },
  { family: 'Roboto Mono', category: 'Mono / Tech', note: 'Neutral · functional · readable', fallback: 'monospace' },
  { family: 'Source Code Pro', category: 'Mono / Tech', note: 'Clean · precise · restrained', fallback: 'monospace' },

  { family: 'Caveat', category: 'Handwriting', note: 'Loose · natural · songwriter', fallback: 'cursive' },
  { family: 'Kalam', category: 'Handwriting', note: 'Marker · energetic · readable', fallback: 'cursive' },
  { family: 'Patrick Hand', category: 'Handwriting', note: 'Notebook · casual · clean', fallback: 'cursive' },
  { family: 'Shadows Into Light', category: 'Handwriting', note: 'Thin · intimate · handwritten', fallback: 'cursive' },
  { family: 'Permanent Marker', category: 'Handwriting', note: 'Bold marker · raw · loud', fallback: 'cursive' },

  { family: 'Syne', category: 'Character', note: 'Art-school · unconventional · modern', fallback: 'sans-serif' },
  { family: 'Unbounded', category: 'Character', note: 'Wide · futuristic · statement', fallback: 'sans-serif' },
  { family: 'Bungee', category: 'Character', note: 'Display · urban · maximal', fallback: 'sans-serif' },
  { family: 'Righteous', category: 'Character', note: 'Retro-future · rounded · iconic', fallback: 'sans-serif' },
  { family: 'Rubik Mono One', category: 'Character', note: 'Block · brutal · poster', fallback: 'sans-serif' },
]);

const FONT_BY_FAMILY = new Map(CURATED_GOOGLE_FONTS.map((font) => [font.family, font]));
const loadedFontLinks = new Map<string, HTMLLinkElement>();

function googleFontValue(family: string) {
  return `google:${family}`;
}

function familyFromValue(value: string): string {
  if (value.startsWith('google:')) return value.slice('google:'.length).trim();
  return '';
}

export function normalizeEditorFontValue(value: unknown): string {
  const text = String(value ?? '').trim();
  const family = familyFromValue(text);
  if (family && FONT_BY_FAMILY.has(family)) return googleFontValue(family);
  if (text === 'mono') return googleFontValue('JetBrains Mono');
  return DEFAULT_EDITOR_FONT;
}

export function ensureEditorFontLoaded(value: string): void {
  if (typeof document === 'undefined') return;
  const normalized = normalizeEditorFontValue(value);
  const family = familyFromValue(normalized);
  if (!family || loadedFontLinks.has(family)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.rhymelabGoogleFont = family;
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
  document.head.append(link);
  loadedFontLinks.set(family, link);
}

export function editorFontFamily(value: string): string {
  const normalized = normalizeEditorFontValue(value);
  const family = familyFromValue(normalized);
  const font = FONT_BY_FAMILY.get(family);
  const fallback = font?.fallback ?? 'serif';
  return `"${family || 'Oranienbaum'}", ${fallback}`;
}

export function editorFontStyle(_value: string): 'normal' {
  return 'normal';
}

export function editorFontWeight(_value: string): number {
  return 400;
}

export function editorFontLabel(value: string): string {
  return familyFromValue(normalizeEditorFontValue(value)) || 'Oranienbaum';
}

export function SystemFontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const normalizedValue = normalizeEditorFontValue(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const categoryScrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureEditorFontLoaded(normalizedValue);
  }, [normalizedValue]);

  const categories = useMemo(
    () => ['All', ...new Set(CURATED_GOOGLE_FONTS.map((font) => font.category))],
    [],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return CURATED_GOOGLE_FONTS.filter((font) => (
      (category === 'All' || font.category === category)
      && (!needle
        || font.family.toLocaleLowerCase().includes(needle)
        || font.category.toLocaleLowerCase().includes(needle)
        || font.note.toLocaleLowerCase().includes(needle))
    ));
  }, [category, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 70,
    overscan: 6,
  });

  useLayoutEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo({ top: 0 });
      virtualizer.measure();
    });
    return () => cancelAnimationFrame(frame);
  }, [category, filtered.length, open, query]);

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!open) return;
    for (const item of virtualItems) {
      const font = filtered[item.index];
      if (font) ensureEditorFontLoaded(googleFontValue(font.family));
    }
  }, [filtered, open, virtualItems]);

  const currentFamily = editorFontLabel(normalizedValue);

  const scrollCategories = (direction: -1 | 1) => {
    const node = categoryScrollerRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(180, Math.min(320, node.clientWidth * 0.72)),
      behavior: 'smooth',
    });
  };

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setCategory('All');
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.fontPickerTrigger}
        onClick={() => setOpen(true)}
        title={language === 'de' ? 'Google Font auswählen' : 'Choose Google Font'}
      >
        <span>{language === 'de' ? 'Schrift' : 'Font'}</span>
        <b style={{ fontFamily: editorFontFamily(normalizedValue) }}>{currentFamily}</b>
      </button>

      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.fontDialogBackdrop} />
          <Dialog.Viewport className={styles.fontDialogViewport}>
            <Dialog.Popup className={styles.fontDialog}>
              <header>
                <div>
                  <p>GOOGLE FONTS · CURATED 50</p>
                  <h2>{language === 'de' ? 'Deine Schreibstimme' : 'Your writing voice'}</h2>
                  <span>
                    {language === 'de'
                      ? '10 Stilwelten · jeweils 5 kuratierte Fonts · sichtbare Vorschauen werden bei Bedarf geladen.'
                      : '10 style worlds · five curated fonts each · visible previews load on demand.'}
                  </span>
                </div>
                <Dialog.Close aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</Dialog.Close>
              </header>

              <label className={styles.fontSearch}>
                <span>⌕</span>
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={language === 'de' ? 'Font, Stil oder Charakter suchen …' : 'Search font, style or character …'}
                />
                <b>{filtered.length}</b>
              </label>

              <div className={styles.fontCategoryStrip}>
                <button
                  type="button"
                  className={styles.fontCategoryArrow}
                  data-direction="left"
                  onClick={() => scrollCategories(-1)}
                  aria-label={language === 'de' ? 'Kategorien nach links' : 'Scroll categories left'}
                >
                  <Icon name="chevron" />
                </button>
                <div
                  ref={categoryScrollerRef}
                  className={styles.fontCategories}
                  role="group"
                  aria-label={language === 'de' ? 'Font-Kategorien' : 'Font categories'}
                >
                  {categories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      data-active={category === item ? 'true' : 'false'}
                      onClick={() => {
                        setCategory(item);
                        scrollerRef.current?.scrollTo({ top: 0 });
                      }}
                    >
                      {item === 'All' ? (language === 'de' ? 'Alle' : 'All') : item}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.fontCategoryArrow}
                  data-direction="right"
                  onClick={() => scrollCategories(1)}
                  aria-label={language === 'de' ? 'Kategorien nach rechts' : 'Scroll categories right'}
                >
                  <Icon name="chevron" />
                </button>
              </div>

              <div ref={scrollerRef} className={styles.fontList}>
                <div
                  className={styles.fontVirtualSpace}
                  style={{ height: virtualizer.getTotalSize() }}
                >
                  {virtualItems.map((item) => {
                    const font = filtered[item.index];
                    if (!font) return null;
                    const fontValue = googleFontValue(font.family);
                    const selected = normalizedValue === fontValue;
                    return (
                      <button
                        key={font.family}
                        type="button"
                        className={styles.fontRow}
                        data-selected={selected ? 'true' : 'false'}
                        style={{
                          transform: `translateY(${item.start}px)`,
                        }}
                        onClick={() => {
                          ensureEditorFontLoaded(fontValue);
                          onChange(fontValue);
                          changeOpen(false);
                        }}
                      >
                        <span>
                          <b style={{ fontFamily: editorFontFamily(fontValue) }}>{font.family}</b>
                          <small>{font.category} · {font.note}</small>
                        </span>
                        {selected ? <strong>✓</strong> : <em>Aa</em>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <footer>
                <span>
                  {language === 'de'
                    ? 'Oranienbaum ist der Rhyme-Bureau-Default. Auswahl wird lokal mit deinem Workspace gespeichert.'
                    : 'Oranienbaum is the Rhyme Bureau default. Your choice is stored locally with the workspace.'}
                </span>
              </footer>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
