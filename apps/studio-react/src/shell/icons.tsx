import type { ReactNode, SVGProps } from 'react';

type IconName =
  | 'pen'
  | 'search'
  | 'grid'
  | 'bookmark'
  | 'settings'
  | 'sun'
  | 'command'
  | 'chevron'
  | 'close'
  | 'spark'
  | 'panel'
  | 'language'
  | 'check'
  | 'plus'
  | 'edit'
  | 'arrowUp'
  | 'arrowDown'
  | 'trash'
  | 'folder'
  | 'waveform';

const PATHS: Record<IconName, ReactNode> = {
  waveform: <path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4" />,
  pen: <><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m13 6 5 5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  bookmark: <path d="M5 3h14v18l-7-5-7 5Z" />,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
  command: <><path d="M8 9H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V6a3 3 0 1 1 3 3Z" /></>,
  chevron: <path d="m7 9 5 5 5-5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4Z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16" /></>,
  language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9S14.4 18.4 12 21c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="m4 20 4.2-1 10.7-10.7-3.2-3.2L5 15.8Z" /><path d="m14.8 6 3.2 3.2" /></>,
  arrowUp: <><path d="m6 10 6-6 6 6" /><path d="M12 4v16" /></>,
  arrowDown: <><path d="m6 14 6 6 6-6" /><path d="M12 20V4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>,
  folder: <path d="M3 7h7l2 2h9v10H3Z" />,
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
