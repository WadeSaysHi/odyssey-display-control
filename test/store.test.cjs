const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store.cjs');
test('fails closed when encryption is unavailable, never writes plaintext', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'odyssey-store-'));
  const store = new Store(folder, { isAsyncEncryptionAvailable: async () => false });
  try { await assert.rejects(store.save({ token: 'secret' }), { code: 'STORAGE' }); assert.deepEqual(await fs.readdir(folder), []); }
  finally { await fs.rm(folder, { recursive: true }); }
});
test('missing credentials return null; corrupted credentials require recovery', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'odyssey-store-'));
  const store = new Store(folder, { isAsyncEncryptionAvailable: async () => true, decryptStringAsync: async () => { throw Error('corrupt'); } });
  try {
    assert.equal(await store.load(), null); await fs.writeFile(store.file, 'corrupt');
    await assert.rejects(store.load(), { code: 'STORAGE' }); await store.clear(); assert.equal(await store.load(), null);
  } finally { await fs.rm(folder, { recursive: true }); }
});
