const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { fail } = require('./transport.cjs');
const { Store } = require('./store.cjs');
const PROFILE = 'oled-g8-tested';
function valid(data) {
  return data?.version === 1 && Array.isArray(data.devices) && data.devices.length > 0 && data.devices.length <= 32 &&
    new Set(data.devices.map(d => d.id)).size === data.devices.length && data.devices.some(d => d.id === data.selectedId) &&
    data.devices.every(d => typeof d.id === 'string' && /^[\w-]{1,64}$/.test(d.id) && typeof d.name === 'string' && d.name.length > 0 && d.name.length <= 60 &&
      (d.record === null || (d.record.host && d.record.identity && d.record.mobilePin && d.record.ipPin && d.record.token)));
}
class Catalog {
  constructor(folder, crypto) { this.folder = folder; this.crypto = crypto; this.file = path.join(folder, 'displays.enc'); this.queue = Promise.resolve(); }
  async load() {
    try {
      const bytes = await fs.readFile(this.file);
      if (!await this.crypto.isAsyncEncryptionAvailable()) throw fail('STORAGE');
      const data = JSON.parse((await this.crypto.decryptStringAsync(bytes)).result);
      if (!valid(data)) throw fail('STORAGE');
      this.data = data;
    } catch (e) {
      if (e.code !== 'ENOENT') throw fail('STORAGE'); // Corruption must never silently replace saved connections.
      const record = await new Store(this.folder, this.crypto).load();
      const id = randomUUID();
      this.data = { version: 1, selectedId: id, devices: [{ id, name: record ? 'Odyssey OLED G8' : 'Display 1', record: record ? { ...record, controlProfile: PROFILE } : null }] };
      await this.commit(this.data); // The legacy encrypted file is retained unchanged for recovery.
    }
    return structuredClone(this.data);
  }
  commit(next) {
    const run = this.queue.then(async () => {
      const data = typeof next === 'function' ? next(structuredClone(this.data)) : next;
      if (!valid(data) || !await this.crypto.isAsyncEncryptionAvailable()) throw fail('STORAGE');
      const bytes = await this.crypto.encryptStringAsync(JSON.stringify(data));
      await fs.mkdir(this.folder, { recursive: true, mode: 0o700 });
      await fs.writeFile(this.file + '.tmp', bytes, { mode: 0o600 });
      await fs.rename(this.file + '.tmp', this.file);
      this.data = data;
    });
    this.queue = run.catch(() => {}); return run;
  }
  store(id) {
    return { load: async () => structuredClone(this.data.devices.find(d => d.id === id)?.record || null),
      save: record => this.commit(data => {
        const device = data.devices.find(d => d.id === id); if (!device) throw fail('TARGET');
        if (data.devices.some(d => d.id !== id && d.record?.identity === record.identity)) throw fail('DUPLICATE');
        device.record = record; return data;
      }),
      clear: () => this.commit(data => { const d = data.devices.find(d => d.id === id); if (!d) throw fail('TARGET'); d.record = null; return data; }) };
  }
}
module.exports = { Catalog, PROFILE };
