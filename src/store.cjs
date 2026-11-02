const fs = require('node:fs/promises');
const path = require('node:path');
const { fail } = require('./transport.cjs');

class Store {
  constructor(folder, safeStorage) { this.file = path.join(folder, 'connection.enc'); this.crypto = safeStorage; }
  async available() {
    if (!await this.crypto.isAsyncEncryptionAvailable()) throw fail('STORAGE');
  }
  async load() {
    let data;
    try { data = await fs.readFile(this.file); }
    catch (error) { if (error.code === 'ENOENT') return null; throw fail('STORAGE'); }
    await this.available();
    try {
      const result = await this.crypto.decryptStringAsync(data);
      const record = JSON.parse(result.result);
      if (!record.host || !record.identity || !record.mobilePin || !record.ipPin || !record.token) throw fail('STORAGE');
      return record;
    } catch { throw fail('STORAGE'); }
  }
  async save(record) {
    await this.available();
    try {
      const encrypted = await this.crypto.encryptStringAsync(JSON.stringify(record));
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await fs.writeFile(this.file + '.tmp', encrypted, { mode: 0o600 });
      await fs.rename(this.file + '.tmp', this.file);
    } catch { throw fail('STORAGE'); }
  }
  async clear() { await fs.rm(this.file, { force: true }); }
}
module.exports = { Store };
