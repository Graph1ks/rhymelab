import { expect, test, type Page } from '@playwright/test';

const isMobileProject = (name: string) => name.startsWith('mobile-');

async function openStudio(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-rhymelab-app-shell="true"]')).toBeVisible();

  const studio = page.getByRole('button', { name: /^Studio$/ }).first();
  await expect(studio).toBeVisible();
  await studio.click();

  await expect(page.locator('main[data-surface="studio"]')).toBeVisible();
  const editor = page.getByRole('textbox', { name: /Songtext Editor|Lyrics editor/ });
  await expect(editor).toBeVisible();
  return editor;
}

test.describe('R10 automated browser acceptance', () => {
  test('editor.ime — composition is one undo/redo transaction', async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), 'desktop behavioral gate');

    const editor = await openStudio(page);
    const before = await editor.inputValue();
    const suffix = ' 東京';

    await editor.evaluate((node, text) => {
      const textarea = node as HTMLTextAreaElement;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      if (!setValue) throw new Error('textarea value setter unavailable');

      const start = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(start, start);
      textarea.dispatchEvent(new CompositionEvent('compositionstart', {
        bubbles: true,
        data: '',
      }));

      const next = textarea.value + text;
      setValue.call(textarea, next);
      textarea.setSelectionRange(next.length, next.length);
      textarea.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: text,
        inputType: 'insertCompositionText',
        isComposing: true,
      }));
      textarea.dispatchEvent(new CompositionEvent('compositionend', {
        bubbles: true,
        data: text,
      }));
    }, suffix);

    await expect.poll(() => editor.inputValue()).toBe(before + suffix);

    await editor.press('Control+z');
    await expect.poll(() => editor.inputValue()).toBe(before);

    await editor.press('Control+y');
    await expect.poll(() => editor.inputValue()).toBe(before + suffix);
  });

  test('perform.metronome — Web Audio transport starts, stops and survives tempo changes', async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), 'desktop behavioral gate');

    await openStudio(page);
    await page.getByRole('button', { name: /^Perform$/ }).click();

    const metronome = page.getByRole('button', { name: /Metronom|Metronome|Stop/ });
    await expect(metronome).toBeVisible();

    const noCount = page.getByRole('button', { name: 'No count' });
    if (await noCount.count()) await noCount.click();

    const doubleTime = page.getByRole('button', { name: '2×' });
    if (await doubleTime.count()) await doubleTime.click();

    await metronome.click();
    await expect(metronome).toHaveAttribute('aria-pressed', 'true');
    await expect(metronome).toContainText('Stop');

    await page.waitForTimeout(180);

    await metronome.click();
    await expect(metronome).toHaveAttribute('aria-pressed', 'false');
    await expect(metronome).toContainText(/Metronom|Metronome/);
  });

  test('mobile.navigation — surface changes preserve editor content and library round-trip', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), 'mobile behavioral gate');

    const editor = await openStudio(page);
    const marker = 'r10-mobile-state-marker';
    const before = await editor.inputValue();
    await editor.fill(before + '\n' + marker);
    await expect.poll(() => editor.inputValue()).toContain(marker);

    const search = page.getByRole('button', { name: /Reimsuche|Rhyme search/ }).first();
    await search.tap();
    await expect(page.locator('main[data-surface="search"]')).toBeVisible();

    await page.getByRole('button', { name: /^Studio$/ }).first().tap();
    await expect(page.locator('main[data-surface="studio"]')).toBeVisible();
    const restoredEditor = page.getByRole('textbox', { name: /Songtext Editor|Lyrics editor/ });
    await expect(restoredEditor).toHaveValue(new RegExp(marker));

    await page.getByRole('button', { name: /Bibliothek|Library/ }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Schließen|Close/ }).tap();
    await expect(restoredEditor).toHaveValue(new RegExp(marker));
  });

  test('mobile.swap — editor/results swap preserves exact selection context', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), 'mobile behavioral gate');

    const editor = await openStudio(page);
    const value = await editor.inputValue();
    const start = Math.min(1, value.length);
    const end = Math.min(Math.max(start + 1, 2), value.length || 2);

    if (!value.length) {
      await editor.fill('test line');
    }

    await editor.evaluate((node, range) => {
      const textarea = node as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(range.start, range.end);
      textarea.dispatchEvent(new Event('select', { bubbles: true }));
    }, { start, end });

    const foundation = page.locator('[data-mobile-pane]');
    await expect(foundation).toHaveAttribute('data-mobile-pane', 'editor');

    const swap = page.getByRole('group', { name: /Mobile Studio Ansicht|Mobile Studio view/ });
    await swap.getByRole('button', { name: /Reime|Rhymes/ }).tap();
    await expect(foundation).toHaveAttribute('data-mobile-pane', 'results');

    await swap.getByRole('button', { name: /^Editor$/ }).tap();
    await expect(foundation).toHaveAttribute('data-mobile-pane', 'editor');

    const selection = await editor.evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      return { start: textarea.selectionStart, end: textarea.selectionEnd };
    });
    expect(selection).toEqual({ start, end });
  });

  test('mobile.keyboard — visual viewport contraction propagates to the app shell', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), 'mobile behavioral gate');

    const editor = await openStudio(page);
    await editor.focus();

    await page.setViewportSize({ width: 390, height: 520 });
    await page.waitForTimeout(100);

    const viewportState = await page.evaluate(() => {
      const root = document.documentElement;
      const active = document.activeElement as HTMLElement | null;
      return {
        cssHeight: getComputedStyle(root).getPropertyValue('--visual-viewport-height').trim(),
        keyboardState: root.dataset.mobileKeyboard ?? '',
        activeTag: active?.tagName ?? '',
        innerHeight: window.innerHeight,
        visualHeight: window.visualViewport?.height ?? window.innerHeight,
      };
    });

    expect(viewportState.activeTag).toBe('TEXTAREA');
    expect(Number.parseFloat(viewportState.cssHeight)).toBeGreaterThan(400);
    expect(Number.parseFloat(viewportState.cssHeight)).toBeLessThanOrEqual(540);
    expect(Math.abs(Number.parseFloat(viewportState.cssHeight) - viewportState.visualHeight)).toBeLessThanOrEqual(2);
  });

  test('mobile.touch — primary controls meet touch sizing and work via tap', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), 'mobile behavioral gate');

    await openStudio(page);

    const primary = [
      page.getByRole('button', { name: /^Studio$/ }).first(),
      page.getByRole('button', { name: /Reimsuche|Rhyme search/ }).first(),
      page.getByRole('group', { name: /Mobile Studio Ansicht|Mobile Studio view/ }).getByRole('button', { name: /^Editor$/ }),
      page.getByRole('group', { name: /Mobile Studio Ansicht|Mobile Studio view/ }).getByRole('button', { name: /Reime|Rhymes/ }),
      page.getByRole('group', { name: /Studio Modus|Studio mode/ }).getByRole('button', { name: /Schreiben|Write/ }),
      page.getByRole('group', { name: /Studio Modus|Studio mode/ }).getByRole('button', { name: /^Perform$/ }),
    ];

    for (const control of primary) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, 'primary control must have a box').not.toBeNull();
      expect(box!.height, 'primary touch target height').toBeGreaterThanOrEqual(44);
    }

    await page.getByRole('group', { name: /Mobile Studio Ansicht|Mobile Studio view/ })
      .getByRole('button', { name: /Reime|Rhymes/ })
      .tap();
    await expect(page.locator('[data-mobile-pane]')).toHaveAttribute('data-mobile-pane', 'results');
  });

  test('mobile.no-hover — core actions remain reachable with hover disabled', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), 'mobile behavioral gate');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const editor = await openStudio(page);

    const media = await page.evaluate(() => ({
      hover: matchMedia('(hover: hover)').matches,
      coarse: matchMedia('(pointer: coarse)').matches,
    }));
    expect(media.hover).toBe(false);
    expect(media.coarse).toBe(true);

    await page.getByRole('button', { name: /Bibliothek|Library/ }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Schließen|Close/ }).tap();

    await page.getByRole('group', { name: /Studio Modus|Studio mode/ })
      .getByRole('button', { name: /^Perform$/ })
      .tap();
    await expect(page.getByRole('button', { name: /Metronom|Metronome/ })).toBeVisible();

    await page.getByRole('group', { name: /Studio Modus|Studio mode/ })
      .getByRole('button', { name: /Schreiben|Write/ })
      .tap();
    await expect(editor).toBeVisible();
  });
});
