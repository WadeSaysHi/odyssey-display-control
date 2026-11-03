const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Appearance } = require('../src/appearance.cjs');
test('appearance persists across launches, rejects invalid input and recovers corrupt data', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'odyssey-appearance-'));
  try {
    const prefs = new Appearance(folder); assert.equal((await prefs.load()).theme, 'system');
    await Promise.all([prefs.set({ theme: 'dark', alwaysScrollbars: true }), prefs.set({ theme: 'light', alwaysScrollbars: false })]);
    assert.equal((await new Appearance(folder).load()).theme, 'light');
    assert.throws(() => prefs.set({ theme: 'invalid', alwaysScrollbars: false }));
    await fs.writeFile(prefs.file, '{invalid'); assert.equal((await new Appearance(folder).load()).theme, 'system');
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
