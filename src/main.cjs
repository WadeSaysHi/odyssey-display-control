const { app, BrowserWindow, ipcMain, Menu, safeStorage, dialog, nativeTheme } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Controller, messages } = require('./controller.cjs');
const { Store } = require('./store.cjs');
const { Appearance } = require('./appearance.cjs');
const { queryDisplays } = require('./local-display.cjs');

app.setName('Odyssey OLED G8 Controller');
app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? 'Odyssey OLED G8 Controller' : 'Odyssey OLED G8 Controller Development'));
if (process.argv.includes('--self-test')) {
  app.setPath('userData', path.join(require('node:os').tmpdir(), 'odyssey-controller-diagnostics', 'profile'));
}
if (process.argv.includes('--ui-test')) app.setPath('userData', path.join(require('node:os').tmpdir(), `odyssey-ui-${process.pid}`));
let controller, win;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(async () => {
    if (!['darwin', 'win32'].includes(process.platform)) {
      dialog.showErrorBox('Unsupported system', 'This app supports macOS and Windows.'); app.quit(); return;
    }
    const appearance = new Appearance(app.getPath('userData'));
    await appearance.load();
    nativeTheme.themeSource = appearance.value.theme;
    const appearanceState = () => ({ ...appearance.value, dark: nativeTheme.shouldUseDarkColors, platform: process.platform });
    const syncChrome = () => {
      if (!win || win.isDestroyed()) return;
      const dark = nativeTheme.shouldUseDarkColors;
      win.setBackgroundColor(dark ? '#1c1c1e' : '#f5f5f7');
      if (process.platform === 'win32') win.setTitleBarOverlay({ color: dark ? '#2c2c2e' : '#ffffff', symbolColor: dark ? '#f5f5f7' : '#1d1d1f', height: 48 });
      win.webContents.send('monitor:appearance', appearanceState());
    };
    nativeTheme.on('updated', syncChrome);
    const store = new Store(app.getPath('userData'), safeStorage);
    controller = new Controller(store, undefined, { queryDisplays });
    const page = pathToFileURL(path.join(__dirname, '../ui/index.html')).href;
    for (const [name, action] of Object.entries({
      state: () => controller.snapshot(),
      appearance: async value => { if (value !== undefined) { await appearance.set(value); nativeTheme.themeSource = appearance.value.theme; syncChrome(); } return appearanceState(); },
      remote: key => controller.remoteKey(key),
      pair: value => controller.pair(value?.host, { autoConfirm: value?.autoConfirm === true }),
      reconnect: host => controller.reconnect(host),
      switch: key => controller.switchSource(key),
      forget: () => controller.forget(),
      information: () => controller.refreshInformation(),
      setting: value => controller.setSetting(value?.key, value?.value, value?.input),
      associate: value => controller.associateComputer(value?.input, value?.displayKey),
    })) ipcMain.handle(`monitor:${name}`, (event, value) => {
      if (event.sender !== win?.webContents || event.senderFrame?.url !== page) throw new Error('Untrusted sender');
      return action(value);
    });
    const createWindow = () => {
      win = new BrowserWindow({ width: 1250, height: 840, minWidth: 880, minHeight: 650,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 18 } } : { titleBarOverlay: true }),
        title: app.getName(), backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7',
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true,
          contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', event => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      win.webContents.session.setPermissionCheckHandler(() => false);
      syncChrome();
      win.loadFile(path.join(__dirname, '../ui/index.html'));
    };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'editMenu' }, { role: 'windowMenu' },
    ]));
    controller.on('state', state => { if (win && !win.isDestroyed()) win.webContents.send('monitor:state', state); });
    createWindow();
    if (process.argv.includes('--self-test')) {
      const { diagnose } = require('./diagnostics.cjs');
      await diagnose({ app, win, controller, safeStorage });
      app.quit(); return;
    }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
    try { await controller.init(); }
    catch { controller.update({ status: 'setup', message: messages.STORAGE }); }
  }).catch(() => { dialog.showErrorBox('Unable to start', 'Restart the app and check your OS credential store.'); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => controller?.close());
