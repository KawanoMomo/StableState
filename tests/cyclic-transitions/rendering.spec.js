// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8765/stablestate.html';

async function setDsl(page, dsl) {
  await page.evaluate((d) => {
    const ta = document.querySelector('#editor');
    ta.value = d;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(100);
}

test.describe('@cyclic renderSVG', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('cyclic transition has stroke-dasharray 6,4 and amber stroke', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [G] / Act @cyclic`);
    const info = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('#svg-wrap svg polyline, #svg-wrap svg path'));
      return paths.map(p => ({
        tag: p.tagName,
        dash: p.getAttribute('stroke-dasharray'),
        stroke: p.getAttribute('stroke')
      }));
    });
    const cyclicEdge = info.find(p => p.stroke && p.stroke.toLowerCase() === '#f59e0b');
    expect(cyclicEdge).toBeTruthy();
    expect(cyclicEdge.dash).toBe('6,4');
  });

  test('cyclic label has ⟳ prefix', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [Ready] / InitDrive @cyclic`);
    const labelText = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('#svg-wrap svg text'));
      return texts.map(t => t.textContent).join(' | ');
    });
    expect(labelText).toContain('⟳');
  });

  test('user color override wins, ⟳ still shown', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [G] / Act @cyclic color=#0000FF`);
    const info = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('#svg-wrap svg polyline, #svg-wrap svg path'));
      const texts = Array.from(document.querySelectorAll('#svg-wrap svg text')).map(t => t.textContent).join(' | ');
      return {
        paths: paths.map(p => ({ dash: p.getAttribute('stroke-dasharray'), stroke: p.getAttribute('stroke') })),
        hasCycleGlyph: texts.includes('⟳')
      };
    });
    const userColored = info.paths.find(p => p.stroke && p.stroke.toLowerCase() === '#0000ff');
    expect(userColored).toBeTruthy();
    expect(info.hasCycleGlyph).toBe(true);
  });

  test('user style=solid override removes dash, ⟳ still shown', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [G] / Act @cyclic style=solid`);
    const info = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('#svg-wrap svg polyline, #svg-wrap svg path'));
      const texts = Array.from(document.querySelectorAll('#svg-wrap svg text')).map(t => t.textContent).join(' | ');
      return {
        paths: paths.map(p => ({ dash: p.getAttribute('stroke-dasharray'), stroke: p.getAttribute('stroke') })),
        hasCycleGlyph: texts.includes('⟳')
      };
    });
    const amberPath = info.paths.find(p => p.stroke && p.stroke.toLowerCase() === '#f59e0b');
    expect(amberPath).toBeTruthy();
    expect(amberPath.dash).toBeFalsy();
    expect(info.hasCycleGlyph).toBe(true);
  });

  test('non-cyclic transitions unchanged', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX`);
    const info = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('#svg-wrap svg text')).map(t => t.textContent).join(' | ');
      return { hasCycleGlyph: texts.includes('⟳') };
    });
    expect(info.hasCycleGlyph).toBe(false);
  });
});
