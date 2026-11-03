const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { profile, validate } = require('./display-profile.cjs');
const { Controller, messages } = require('./controller.cjs');
class Fleet extends EventEmitter {
  constructor(catalog, io, options = {}) { super(); this.catalog = catalog; this.io = io; this.options = options; this.controllers = new Map(); this.management = Promise.resolve(); this.error = null; }
  get active() { return this.controllers.get(this.catalog.data?.selectedId); }
  snapshot() {
    return { ...(this.active?.snapshot() || { status: 'setup', sources: [], message: this.error || 'Loading saved displays…' }),
      displayProfile: profile(this.catalog.data?.devices.find(d=>d.id===this.catalog.data.selectedId)),
      deviceId: this.catalog.data?.selectedId || null, deviceName: this.catalog.data?.devices.find(d => d.id === this.catalog.data.selectedId)?.name || 'Display',
      devices: (this.catalog.data?.devices || []).map(d => ({ id: d.id, name: d.name, status: this.controllers.get(d.id)?.state.status || 'setup', paired: Boolean(d.record) })) };
  }
  emitState() { this.emit('state', this.snapshot()); }
  update(patch) { if (this.active) this.active.update(patch); else { this.error = patch.message; this.emitState(); } }
  create(id) {
    const c = new Controller(this.catalog.store(id), this.io, {...this.options, speakers:()=>profile(this.catalog.data.devices.find(d=>d.id===id)).speakers});
    c.on('state', () => this.emitState()); this.controllers.set(id, c); return c;
  }
  async init() {
    const data = await this.catalog.load();
    const controllers = data.devices.map(d => this.create(d.id)); this.emitState();
    await Promise.allSettled(controllers.map(c => c.init()));
  }
  manage(value) { const work = this.management.then(() => this.manageOne(value)); this.management = work.catch(() => {}); return work; }
  async manageOne(value) {
    try {
      if (value?.action === 'select') {
        if (!this.controllers.has(value.id)) return { ok: false, code: 'TARGET', message: messages.TARGET };
        await this.catalog.commit(data => { data.selectedId = value.id; return data; });
      } else if (value?.action === 'add') {
        if (this.controllers.size >= 32) return { ok: false, message: 'A maximum of 32 saved displays is supported.' };
        const id = randomUUID();
        await this.catalog.commit(data => { data.devices.push({ id, name: `Display ${data.devices.length + 1}`, record: null }); data.selectedId = id; return data; });
        const c = this.create(id); await c.init();
      } else if (value?.action === 'configure') {
        if(value.id!==this.catalog.data.selectedId || !validate(value.presentation)) return {ok:false,message:'Choose valid display information.'};
        await this.catalog.commit(data=>{data.devices.find(d=>d.id===value.id).presentation=value.presentation;return data;});
        this.active.update({});
      } else if (value?.action === 'rename') {
        const name = typeof value.name === 'string' ? value.name.trim() : '';
        if (!name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) return { ok: false, message: 'Use a display name of 1–60 characters.' };
        if (value.id !== this.catalog.data.selectedId) return { ok: false, code: 'TARGET', message: messages.TARGET };
        await this.catalog.commit(data => { data.devices.find(d => d.id === value.id).name = name; return data; });
      } else if (value?.action === 'remove') {
        const c = this.controllers.get(value.id);
        if (!c || c.state.busy || c.record) return { ok: false, message: 'Forget the connection before removing its display entry.' };
        if (this.controllers.size === 1) return { ok: false, message: 'Keep one display entry, or add another first.' };
        await this.catalog.commit(data => { data.devices = data.devices.filter(d => d.id !== value.id); if (data.selectedId === value.id) data.selectedId = data.devices[0].id; return data; });
        c.close(); this.controllers.delete(value.id);
      } else return { ok: false, message: 'Unknown display action.' };
      this.emitState(); return { ok: true };
    } catch { return { ok: false, code: 'STORAGE', message: messages.STORAGE }; }
  }
  invoke(id, method, ...args) {
    if (!id || id !== this.catalog.data?.selectedId) return Promise.resolve({ ok: false, code: 'TARGET', message: messages.TARGET });
    const c = this.controllers.get(id); return c[method](...args);
  }
  close() { for (const c of this.controllers.values()) c.close(); }
}
// Bind every quick action to the selected target at invocation, or a captured menu target.
for (const method of ['remoteKey', 'pair', 'reconnect', 'switchSource', 'forget', 'refreshInformation', 'setSetting', 'associateComputer']) {
  Fleet.prototype[method] = function (...args) { return this.invoke(this.snapshot().deviceId, method, ...args); };
}
module.exports = { Fleet };
