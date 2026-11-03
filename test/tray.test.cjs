const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DesktopTray, menuTemplate } = require('../src/tray.cjs');
const fresh = () => ({ status: 'online', paired: true, current: 'usb-c', busy: false, sources: [{ key: 'usb-c' }, { key: 'hdmi' }],
  information: { monitorFresh: true, monitor: { input: 'usb-c', at: Date.now() }, controls: [{ key: 'volume', value: 15, enabled: true }, { key: 'mute', value: 'muteOff', enabled: true }] } });
function fixture() {
  const c = new EventEmitter(); let state = fresh(), opened = 0, quit = 0; const writes = [];
  Object.assign(c, { snapshot: () => state, update: patch => { state = { ...state, ...patch }; c.emit('state'); },
    setSetting: async (...args) => { writes.push(args); return { ok: true }; }, switchSource: async key => { writes.push(['switch', key]); return { ok: true }; } });
  class Tray extends EventEmitter { setToolTip(t) { this.tooltip = t; } getBounds() { return {x: 0, y: 0, width: 16, height: 16}; } closeContextMenu() { this.current?.emit('menu-will-close'); } destroy() { this.dead = true; } }
  const e = { Tray, nativeImage: { createFromPath: () => ({ isEmpty: () => false, setTemplateImage() {} }) }, Menu: { buildFromTemplate: template => Object.assign(new EventEmitter(), { items: template, popup() {}, closePopup() { this.emit('menu-will-close'); } }) } };
  const tray = new DesktopTray(c, () => opened++, () => quit++, e);
  return { c, tray, writes, opened: () => opened, quit: () => quit, state: () => state };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('tray exposes available sources and disables stale or busy controls', () => {
  const state = fresh(); let template = menuTemplate(state, {});
  assert.equal(template.find(x => x.id === 'source-displayport').enabled, false);
  assert.equal(template.find(x => x.id === 'source-usb-c').checked, true);
  state.information.monitor.at -= 31000; template = menuTemplate(state, {});
  assert.equal(template.find(x => x.id === 'volume-up').enabled, false);
  state.busy = true; assert.equal(menuTemplate(state, {}).find(x => x.id === 'source-hdmi').enabled, false);
});
test('tray settings use current readings and preserve input context; stale menu actions fail safely', async () => {
  const f = fixture();
  try {
    f.tray.actions.volume(1, 'usb-c'); await tick(); assert.deepEqual(f.writes, [['volume', 16, 'usb-c']]);
    f.tray.actions.mute('usb-c'); await tick(); assert.deepEqual(f.writes[1], ['mute', 'muteOn', 'usb-c']);
    f.c.update({ current: 'hdmi' }); f.tray.actions.volume(1, 'usb-c'); await tick();
    assert.equal(f.writes.length, 2); assert.equal(f.opened(), 1);
    f.tray.actions.open(); f.tray.actions.quit(); assert.equal(f.quit(), 1);
  } finally { f.tray.destroy(); }
});
test('native popup stays stable during polls; close refreshes and destruction cleans listeners', async () => {
  const f = fixture();
  f.tray.popup(); const original = f.tray.menu;
  f.c.update({ message: 'New status' }); assert.equal(f.tray.menu, original);
  original.emit('menu-will-close'); await tick(); assert.notEqual(f.tray.menu, original);
  f.tray.destroy(); assert.equal(f.c.listenerCount('state'), 0); assert.equal(f.tray.tray.dead, true);
  f.tray.destroy();
});
test('an open native menu cannot send a command to a newly selected display',async()=>{
 const f=fixture();try{f.c.update({deviceId:'first',deviceName:'First'});const menu=f.tray.menu;f.c.update({deviceId:'second',deviceName:'Second'});menu.items.find(i=>i.id==='source-usb-c').click();await tick();assert.equal(f.writes.length,0);assert.equal(f.opened(),1);}finally{f.tray.destroy();}
});
