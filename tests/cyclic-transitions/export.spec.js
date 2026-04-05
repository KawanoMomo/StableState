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

async function capturePlantUMLDownload(page) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => exportPlantUML())
  ]);
  const stream = await dl.createReadStream();
  if (!stream) return null;
  let buf = '';
  for await (const chunk of stream) buf += chunk.toString();
  return buf;
}

test.describe('@cyclic export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('SVG export preserves cyclic dash and glyph', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [Ready] / Init @cyclic`);
    const svg = await page.evaluate(() => getExportSVGString());
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('⟳');
    // Sprint 2 OBS-08 regression: resize handles still stripped
    expect(svg).not.toContain('data-resize=');
  });

  test('SVG export keeps arr-cyclic marker', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [G] @cyclic`);
    const svg = await page.evaluate(() => getExportSVGString());
    expect(svg).toContain('id="arr-cyclic"');
    expect(svg).toContain('#F59E0B');
  });

  test('PlantUML export emits cyclic transition with color and dashed arrow', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [Ready] / Init @cyclic`);
    const puml = await capturePlantUMLDownload(page);
    expect(puml).not.toBeNull();
    expect(puml).toMatch(/a\s+-\[#F59E0B,dashed\]->\s+b/);
    expect(puml).toContain('⟳');
  });

  test('PlantUML non-cyclic unchanged', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX`);
    const puml = await capturePlantUMLDownload(page);
    expect(puml).not.toContain('#F59E0B');
    expect(puml).not.toContain('⟳');
    expect(puml).toMatch(/a\s+-->\s+b/);
  });
});

test.describe('@cyclic export — multiline do in PlantUML', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  async function captureDl(page, fn) {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(fn)
    ]);
    const stream = await dl.createReadStream();
    if (!stream) return null;
    let buf = '';
    for await (const chunk of stream) buf += chunk.toString();
    return buf;
  }

  async function setDsl(page, dsl) {
    await page.evaluate((d) => {
      const ta = document.querySelector('#editor');
      ta.value = d;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, dsl);
    await page.waitForTimeout(100);
  }

  test('single-line do emitted as state description', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=PollReady
i -> idle`);
    const puml = await captureDl(page, () => exportPlantUML());
    expect(puml).not.toBeNull();
    expect(puml).toMatch(/idle\s*:\s*do\s*\/\s*PollReady/);
  });

  test('multiline do encoded as \\n literal in PlantUML', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="Check1\\nCheck2\\n-> active"
state active "Active" at 14,3 size 8x5
i -> idle`);
    const puml = await captureDl(page, () => exportPlantUML());
    expect(puml).not.toBeNull();
    // The 2-char \n literal survives to PlantUML as-is — PlantUML interprets \n as line break
    expect(puml).toMatch(/idle\s*:\s*do\s*\/\s*Check1\\nCheck2\\n-> active/);
  });
});
