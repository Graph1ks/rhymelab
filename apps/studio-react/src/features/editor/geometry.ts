export const EDITOR_VERTICAL_PADDING = 18;

export function editorFallbackLineHeight(fontSize: number): number {
  const numeric = Number(fontSize);
  const size = Number.isFinite(numeric) ? numeric : 21;
  return Math.max(34, size * 1.62);
}

export function fallbackEditorLineTop(
  index: number,
  fontSize: number,
  paddingTop = EDITOR_VERTICAL_PADDING,
): number {
  const lineIndex = Math.max(0, Math.trunc(Number(index) || 0));
  return Number(paddingTop) + lineIndex * editorFallbackLineHeight(fontSize);
}
