import type { StudioUiLanguage } from '../legacy/shell';
import { translateStudioUiText } from '../legacy/shell';

export type AppSurface = 'home' | 'studio' | 'search' | 'library' | 'saved' | 'settings';

export const SHELL_BREAKPOINTS = Object.freeze({
  sidebarRail: 1150,
  mobile: 800,
  compactMobile: 560,
});

export interface NavigationItem {
  id: AppSurface;
  label: string;
  mobileLabel: string;
  shortcut?: string;
  icon: 'pen' | 'search' | 'grid' | 'bookmark' | 'settings';
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = Object.freeze([
  { id: 'studio', label: 'Studio', mobileLabel: 'Schreiben', icon: 'pen' },
  { id: 'search', label: 'Reimsuche', mobileLabel: 'Entdecken', icon: 'search' },
]);

const FALLBACK_EN: Record<string, string> = {
  'Reimsuche': 'Rhyme search',
  'Meine Texte': 'My texts',
  'Merkliste': 'Saved',
  'Schreiben': 'Write',
  'Entdecken': 'Discover',
  'Texte': 'Texts',
  'Einstellungen': 'Settings',
  'Lokal. In deinem Flow.': 'Local. In your flow.',
  'Aktive Oberfläche': 'Active surface',
  'React Studio Vorschau': 'React Studio preview',
  'Shell bereit': 'Shell ready',
  'Befehle öffnen': 'Open commands',
  'Quickstyles öffnen': 'Open quick styles',
  'Light/Dark wechseln': 'Toggle Light/Dark',
  'Mehr': 'More',
  'Zurück': 'Back',
};

export function shellText(source: string, language: StudioUiLanguage): string {
  const translated = translateStudioUiText(source, language);
  if (language === 'en' && translated === source) return FALLBACK_EN[source] ?? source;
  return translated;
}

export function navigationLabel(
  item: NavigationItem,
  language: StudioUiLanguage,
  mobile = false,
): string {
  return shellText(mobile ? item.mobileLabel : item.label, language);
}


export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  const tag = String(element.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (element.isContentEditable === true) return true;
  const role = element.getAttribute?.('role');
  return role === 'textbox' || role === 'searchbox';
}

export function commandPaletteShortcutLabel(platform = ''): string {
  return /mac|iphone|ipad|ipod/u.test(platform.toLocaleLowerCase())
    ? '⌘ ⇧ K'
    : 'Ctrl ⇧ K';
}
