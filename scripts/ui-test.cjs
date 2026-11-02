const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const app = await electron.launch({ args: ['.'], cwd: path.join(__dirname, '..') });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.getByRole('heading', { name: 'Odyssey OLED G8', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await page.getByRole('heading', { name: 'Input Signal Information' }).waitFor();
    assert.equal(await page.locator('.signal-item').count(), 7);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('#refresh-information').disabled);
    await page.getByRole('button', { name: /Set up connection|Connected|Reconnect/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByLabel('Monitor IP address').fill('invalid');
    await page.getByRole('button', { name: /Pair monitor|Pair again/ }).click();
    await page.getByRole('dialog').getByText('Enter a private IPv4 address from your local network.').waitFor();
    await page.getByRole('button', { name: 'Close connection settings' }).click();
    await page.getByRole('button', { name: /Set up connection|Connected|Reconnect/ }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../artifacts/desktop.png') });
    await page.setViewportSize({ width: 680, height: 650 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(__dirname, '../artifacts/compact.png') });
    assert.deepEqual(errors, []);
    console.log('Desktop UI, validation, sandbox, keyboard controls and compact layout: PASS');
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
