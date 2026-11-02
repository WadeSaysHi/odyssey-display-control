const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Controller } = require('../src/controller.cjs');
const { fail } = require('../src/transport.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture({ immediate = false, refused = false, failed = false } = {}) {
  const stats = { okPresses: 0, requests: 0, saved: null, closed: false };
  class Remote {
    constructor(_host, _pin, token) { this.token = token || 'new-remote-secret'; }
    async connect() { if (refused) throw fail('PAIRING'); }
    confirmPairing() { stats.okPresses++; }
    close() { stats.closed = true; }
  }
  class Mobile {
    async request() { return { statusCode: '100', response: [{ sourceId: 'source@USB_C', currentSource: 'True' }] }; }
    close() {}
  }
  const io = { Remote, Mobile, validateHost: x => x, probe: async () => ({ identity: 'fixture', mobilePin: 'pin' }), fingerprint: async () => 'pin',
    ipCall: async () => { stats.requests++; if (!immediate) await sleep(40); if (failed) throw fail('PAIRING'); return { AccessToken: 'ip-secret' }; } };
  const c = new Controller({ save: async record => { stats.saved = record; } }, io, { confirmDelayMs: 10 });
  return { c, stats };
}
test('auto-confirm sends one OK only for a pending app pairing, then stores both credentials', async () => {
  const { c, stats } = fixture(); assert.equal((await c.pair('local', { autoConfirm: true })).ok, true);
  assert.equal(stats.okPresses, 1); assert.equal(stats.closed, true); assert.equal(stats.saved.remoteToken, 'new-remote-secret');
  assert.ok(!JSON.stringify(c.snapshot()).includes('secret'));
});
test('already resolved request never gets an OK', async () => {
  const { c, stats } = fixture({ immediate: true }); await c.pair('local', { autoConfirm: true }); await sleep(30);
  assert.equal(stats.okPresses, 0);
});
test('unauthorized remote cannot auto-confirm; no IP Control request is started', async () => {
  const { c, stats } = fixture({ refused: true }); assert.equal((await c.pair('local', { autoConfirm: true })).code, 'PAIRING');
  assert.equal(stats.okPresses, 0); assert.equal(stats.requests, 0); assert.equal(stats.saved, null); assert.equal(stats.closed, true);
});
test('manual pairing sends no remote commands; denied pairing stores no credential', async () => {
  const { c, stats } = fixture({ failed: true }); assert.equal((await c.pair('local', { autoConfirm: false })).code, 'PAIRING');
  assert.equal(stats.okPresses, 0); assert.equal(stats.saved, null); assert.equal(c.state.busy, false);
});
