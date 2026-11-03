const path = require('node:path');
const {create}=require('./quick-panel.cjs');
const LABELS = { 'usb-c': 'USB-C', displayport: 'DisplayPort', hdmi: 'HDMI' };
function freshControl(state, key) {
  const info = state.information;
  if (state.busy || state.status !== 'online' || !info?.monitorFresh || info.monitor.input !== state.current || Date.now() - info.monitor.at >= 30000) return null;
  return info.controls.find(c => c.key === key && c.enabled) || null;
}
function menuTemplate(state, actions) {
  const volume = freshControl(state, 'volume'), mute = freshControl(state, 'mute');
  const online = state.status === 'online', enabled = online && !state.busy;
  return [
    { label: state.deviceName || 'Odyssey Display Control', enabled: false },
    ...(state.devices?.length ? [{ label: 'Select display', submenu: state.devices.map(d => ({ label: d.name, type: 'radio', checked: d.id === state.deviceId, click: () => actions.select(d.id) })) }] : []),
    { label: `${state.busy ? 'Working…' : online ? 'Connected' : state.paired ? 'Disconnected' : 'Not paired'} — ${state.sources.find(s=>s.key===state.current)?.label || LABELS[state.current] || 'Input unknown'}`, enabled: false },
    { type: 'separator' },
    ...state.sources.map(({key,label=LABELS[key]||'Input'}) => ({ id: `source-${key}`, label, type: 'radio', checked: state.current === key,
      enabled: enabled && state.sources.some(s => s.key === key), click: () => actions.source(key, state.deviceId) })),
    { type: 'separator' },
    { label: volume ? `Volume: ${volume.value}` : 'Volume unavailable — refresh', enabled: false },
    { id: 'volume-up', label: 'Volume up', enabled: Boolean(volume && volume.value < 100), click: () => actions.volume(1, state.current, state.deviceId) },
    { id: 'volume-down', label: 'Volume down', enabled: Boolean(volume && volume.value > 0), click: () => actions.volume(-1, state.current, state.deviceId) },
    { id: 'mute', label: 'Mute', type: 'checkbox', checked: state.information?.controls.some(c => c.key === 'mute' && c.value === 'muteOn') || false,
      enabled: Boolean(mute), click: () => actions.mute(state.current, state.deviceId) },
    { type: 'separator' },
    { id: 'refresh', label: 'Refresh monitor information', enabled: state.paired && !state.busy, click: () => actions.refresh(state.deviceId) },
    { id: 'reconnect', label: 'Reconnect', enabled: state.paired && !state.busy, click: () => actions.reconnect(state.deviceId) },
    { label: (state.message || '').replace(/[\r\n]/g, ' ').slice(0, 110) || 'Local network control', enabled: false },
    { type: 'separator' },
    { id: 'open', label: 'Open Odyssey Display Control', click: actions.open },
    { id: 'quit', label: 'Quit Odyssey Display Control', click: actions.quit },
  ];
}
class DesktopTray {
  constructor(controller, open, quit, electron = require('electron')) {
    this.controller = controller; this.open = open; this.e = electron; this.opened = false; this.destroyed = false;
    const icon = electron.nativeImage.createFromPath(path.join(__dirname, '../ui', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.ico'));
    if (icon.isEmpty()) throw Error('Tray icon unavailable');
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    this.tray = new electron.Tray(icon);
    const run = action => { void Promise.resolve().then(action).then(result => { if (result?.ok === false) open(); }).catch(() => { controller.update({ message: 'The quick control failed. Open the window and reconnect.' }); open(); }); };
    const setting = (key, input, next) => {
      const latest = controller.snapshot(), c = freshControl(latest, key);
      if (!c || latest.current !== input) {
        controller.update({ message: 'Input changed or readings expired. Refresh before changing settings.' }); open(); return;
      }
      return controller.setSetting(key, next(c.value), input);
    };
    const targeted = (id, method, ...args) => {
      if (controller.invoke) return controller.invoke(id, method, ...args);
      return controller[method](...args);
    };
    const guard = (id, work) => run(() => {
      if (id !== controller.snapshot().deviceId) { controller.update({ message: 'Selected display changed. Reopen the menu before sending a command.' }); open(); return; }
      return work();
    });
    this.actions = {
      select: id => run(() => controller.manage({ action: 'select', id })),
      source: (key, id = controller.snapshot().deviceId) => guard(id, () => targeted(id, 'switchSource', key)),
      volume: (delta, input, id = controller.snapshot().deviceId) => guard(id, () => setting('volume', input, value => Math.max(0, Math.min(100, value + delta)))),
      mute: (input, id = controller.snapshot().deviceId) => guard(id, () => setting('mute', input, value => value === 'muteOn' ? 'muteOff' : 'muteOn')),
      refresh: (id = controller.snapshot().deviceId) => guard(id, () => targeted(id, 'refreshInformation')),
      reconnect: (id = controller.snapshot().deviceId) => guard(id, () => { const s = controller.snapshot(); return s.paired ? controller.reconnect(s.host) : undefined; }),
      open, quit,
    };
    if(electron.BrowserWindow && electron.screen) this.showPanel=create(this);
    this.listener = () => this.update(); controller.on('state', this.listener);
    // Do not rebuild a native menu under the pointer while it is open.
    this.tray.on('click', () => this.popup()); this.tray.on('right-click', () => this.popup());
    this.tray.on('double-click', open);
    this.timer = setInterval(() => this.update(), 1000); this.update();
  }
  update() {
    if (this.destroyed) return;
    const state = this.controller.snapshot();
    if(this.panel && !this.panel.isDestroyed()) this.panel.webContents.send('monitor:state',state);
    this.tray.setToolTip(`Odyssey Display Control — ${state.busy ? 'Working' : state.status === 'online' ? state.sources.find(s=>s.key===state.current)?.label || LABELS[state.current] || 'Connected' : 'Disconnected'}`);
    if (this.opened) return;
    const template = menuTemplate(state, this.actions), signature = JSON.stringify(template);
    if (signature === this.signature) return;
    this.signature = signature; this.menu = this.e.Menu.buildFromTemplate(template);
    this.menu.on('menu-will-close', () => { this.opened = false; setImmediate(() => this.update()); });
  }
  popup() {
    if(this.destroyed)return;
    if(this.showPanel){this.showPanel();return;}
    if(this.opened)return;
    this.update(); this.opened = true;
    try { const bounds = this.tray.getBounds();
      this.menu.popup({ x: Math.round(bounds.x), y: Math.round(bounds.y + bounds.height), callback: () => { this.opened = false; this.update(); } }); }
    catch { this.opened = false; this.open(); }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; clearInterval(this.timer); this.controller.removeListener('state', this.listener);
    this.panel?.destroy(); this.menu?.closePopup(); this.tray.destroy();
  }
}
module.exports = { DesktopTray, menuTemplate, freshControl };
