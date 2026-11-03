// Explicit, opt-in packaged-app smoke test. The report contains no device metadata.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Store } = require('./store.cjs');
const t = require('./transport.cjs');
async function diagnose({ win, controller, safeStorage }) {
  const folder = path.join(os.tmpdir(), 'odyssey-controller-diagnostics');
  await fs.mkdir(folder, { recursive: true });
  const report = { platform: process.platform, encryption: false, storageRoundTrip: false, rendered: false, hardwareRead: null, computerDisplayQuery: false, signalSection: false };
  try {
    await controller.init();
    const target = controller.active || controller;
    const store = new Store(path.join(folder, 'test-store'), safeStorage);
    report.encryption = await safeStorage.isAsyncEncryptionAvailable();
    const record = { host: 'fixture', identity: 'fixture', mobilePin: 'fixture', ipPin: 'fixture', token: crypto.randomBytes(32).toString('hex') };
    await store.save(record);
    report.storageRoundTrip = (await store.load()).token === record.token && !(await fs.readFile(store.file)).includes(Buffer.from(record.token));
    await store.clear();
    const hostArg = process.argv.find(x => x.startsWith('--monitor-host='));
    if (hostArg) {
      const host = t.validateHost(hostArg.slice('--monitor-host='.length));
      const device = await t.probe(host);
      target.record = { host, ...device, ipPin: await t.fingerprint(host, 1516) };
      controller.update({ paired: true });
      await target.refresh();
      controller.update({ message: 'Connected. Current input refreshed.' });
      report.hardwareRead = Boolean(target.state.current);
    }
    await target.information.read();
    report.computerDisplayQuery = target.information.snapshot().computerFresh;
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.webContents.send('monitor:state', controller.snapshot());
    if (hostArg) await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timer = setInterval(() => { if (document.querySelector('#connection-label').textContent === 'Connected') { clearInterval(timer); clearTimeout(timeout); resolve(); } }, 25);
      const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('Render timeout')); }, 4000);
    })`);
    await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    report.rendered = await win.webContents.executeJavaScript("document.querySelector('h1').textContent === 'Odyssey Display Control' && typeof window.require === 'undefined' && !!window.monitor");
    report.signalSection = await win.webContents.executeJavaScript("document.querySelectorAll('.signal-item').length === 5 && !!document.querySelector('#refresh-information')");
    await fs.writeFile(path.join(folder, 'desktop.png'), (await win.webContents.capturePage()).toPNG());
  } catch (error) { report.error = error.code || 'DIAGNOSTIC_FAILURE'; }
  finally {
    controller.close();
    await fs.writeFile(path.join(folder, 'report.json'), JSON.stringify(report, null, 2));
  }
}
module.exports = { diagnose };
