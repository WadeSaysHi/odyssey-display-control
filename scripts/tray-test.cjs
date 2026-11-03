const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'); const path = require('node:path'); const fs = require('node:fs/promises');
(async () => {
  const a = await electron.launch({ ...(process.env.ODYSSEY_TEST_EXECUTABLE ? { executablePath: process.env.ODYSSEY_TEST_EXECUTABLE } : {}), args: process.env.ODYSSEY_TEST_EXECUTABLE ? ['--ui-test'] : ['.', '--ui-test'], cwd: path.join(__dirname, '..') });
  let folder;
  try {
    const p = await a.firstWindow(); await p.locator('#keep-in-tray').waitFor({ state: 'attached' });
    await p.waitForFunction(async () => (await window.monitor.appearance()).trayAvailable);
    folder = await a.evaluate(({ app }) => app.getPath('userData'));
    const details = await a.evaluate(({ app }) => ({ name: app.getName(), tray: !app.testTray.tray.isDestroyed(), icon: app.testTray.tray.getBounds(), items: app.testTray.menu.items.map(i => i.id) }));
    assert.equal(details.name, 'Odyssey Display Control'); assert.equal(details.tray, true); assert.ok(details.items.includes('quit'));
    await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await a.evaluate(({ app }) => app.testTray.menu.getMenuItemById('open').click());
    assert.equal(await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    await a.evaluate(({ app }) => { setTimeout(() => app.testTray.menu.closePopup(), 500); app.testTray.popup(); });
    await p.waitForTimeout(800);
    assert.equal(await a.evaluate(({ app }) => app.testTray.opened), false);
    await p.locator('[data-page="appearance"]').click(); await p.locator('#keep-in-tray').uncheck();
    await p.waitForFunction(async () => !(await window.monitor.appearance()).keepInTray);
    assert.equal(await p.locator('#keep-in-tray').isChecked(), false);
    await p.locator('#keep-in-tray').check();
    await p.waitForFunction(async () => (await window.monitor.appearance()).keepInTray);
    // Explicit Quit must bypass the window's hide-on-close handler.
    const closed = a.waitForEvent('close'); await a.evaluate(({ app }) => { setTimeout(() => app.testTray.menu.getMenuItemById('quit').click(), 50); }); await closed;
    const b = await electron.launch({ ...(process.env.ODYSSEY_TEST_EXECUTABLE ? { executablePath: process.env.ODYSSEY_TEST_EXECUTABLE } : {}), args: process.env.ODYSSEY_TEST_EXECUTABLE ? ['--ui-test'] : ['.', '--ui-test'], cwd: path.join(__dirname, '..') });
    let secondFolder;
    try {
      const second = await b.firstWindow(); secondFolder = await b.evaluate(({ app }) => app.getPath('userData'));
      await second.evaluate(() => window.monitor.appearance({ theme: 'system', alwaysScrollbars: false, keepInTray: false }));
      const exited = b.waitForEvent('close'); await b.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 50); }); await exited;
    } finally { await b.close().catch(() => {}); if (secondFolder) await fs.rm(secondFolder, { recursive: true, force: true }); }
    console.log('Native tray: creation, renamed identity, hide/reopen, preference and explicit Quit: PASS');
  } finally { await a.close().catch(() => {}); if (folder) await fs.rm(folder, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
