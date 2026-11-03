const path = require('node:path');
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
    { label: 'Odyssey Display Control', enabled: false },
    { label: `${state.busy ? 'Working…' : online ? 'Connected' : state.paired ? 'Disconnected' : 'Not paired'} — ${LABELS[state.current] || 'Input unknown'}`, enabled: false },
    { type: 'separator' },
    ...Object.entries(LABELS).map(([key, label]) => ({ id: `source-${key}`, label, type: 'radio', checked: state.current === key,
      enabled: enabled && state.sources.some(s => s.key === key), click: () => actions.source(key) })),
    { type: 'separator' },
    { label: volume ? `Volume: ${volume.value}` : 'Volume unavailable — refresh', enabled: false },
    { id: 'volume-up', label: 'Volume up', enabled: Boolean(volume && volume.value < 100), click: () => actions.volume(1, state.current) },
    { id: 'volume-down', label: 'Volume down', enabled: Boolean(volume && volume.value > 0), click: () => actions.volume(-1, state.current) },
    { id: 'mute', label: 'Mute', type: 'checkbox', checked: state.information?.controls.some(c => c.key === 'mute' && c.value === 'muteOn') || false,
      enabled: Boolean(mute), click: () => actions.mute(state.current) },
    { type: 'separator' },
    { id: 'refresh', label: 'Refresh monitor information', enabled: state.paired && !state.busy, click: actions.refresh },
    { id: 'reconnect', label: 'Reconnect', enabled: state.paired && !state.busy, click: actions.reconnect },
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
    this.actions = {
      source: key => run(() => controller.switchSource(key)),
      volume: (delta, input) => run(() => setting('volume', input, value => Math.max(0, Math.min(100, value + delta)))),
      mute: input => run(() => setting('mute', input, value => value === 'muteOn' ? 'muteOff' : 'muteOn')),
      refresh: () => run(() => controller.refreshInformation()),
      reconnect: () => run(() => { const s = controller.snapshot(); return s.paired ? controller.reconnect(s.host) : undefined; }),
      open, quit,
    };
    this.listener = () => this.update(); controller.on('state', this.listener);
    // Do not rebuild a native menu under the pointer while it is open.
    this.tray.on('click', () => this.popup()); this.tray.on('right-click', () => this.popup());
    this.tray.on('double-click', open);
    this.timer = setInterval(() => this.update(), 1000); this.update();
  }
  update() {
    if (this.destroyed) return;
    const state = this.controller.snapshot();
    this.tray.setToolTip(`Odyssey Display Control — ${state.busy ? 'Working' : state.status === 'online' ? LABELS[state.current] || 'Connected' : 'Disconnected'}`);
    if (this.opened) return;
    const template = menuTemplate(state, this.actions), signature = JSON.stringify(template);
    if (signature === this.signature) return;
    this.signature = signature; this.menu = this.e.Menu.buildFromTemplate(template);
    this.menu.on('menu-will-close', () => { this.opened = false; setImmediate(() => this.update()); });
  }
  popup() {
    if (this.destroyed || this.opened) return;
    this.update(); this.opened = true;
    try { const bounds = this.tray.getBounds();
      this.menu.popup({ x: Math.round(bounds.x), y: Math.round(bounds.y + bounds.height), callback: () => { this.opened = false; this.update(); } }); }
    catch { this.opened = false; this.open(); }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; clearInterval(this.timer); this.controller.removeListener('state', this.listener);
    this.menu?.closePopup(); this.tray.destroy();
  }
}
module.exports = { DesktopTray, menuTemplate, freshControl };
