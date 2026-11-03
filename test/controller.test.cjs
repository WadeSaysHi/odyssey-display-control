const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Controller, parseSources } = require('../src/controller.cjs');
const { validateHost, fail } = require('../src/transport.cjs');

const keys = ['USB_C', 'DISPLAYPORT', 'HDMI1'];
const rows = current => ({ statusCode: '100', response: keys.map(key => ({ sourceId: `s/source.layer.test@${key}`, currentSource: key === current ? 'True' : 'False', title: '<script>untrusted</script>' })) });
function fixture(options = {}) {
  let actual = 'USB_C', writes = 0, reads = 0;
  const record = { host: 'local', identity: 'fixture', mobilePin: 'pin', ipPin: 'pin', token: 'secret' };
  const store = { load: async () => record, save: async () => {}, clear: async () => {} };
  class Mobile {
    async request(method, params) {
      if (options.offline) throw fail('OFFLINE');
      if (method === 'get.extsources') { reads++; return rows(actual); }
      writes++;
      if (!options.ignoreWrite) actual = params.requestId.split('@')[1];
      if (options.lostAck) throw fail('OFFLINE');
      return { statusCode: '100', response: { status: 'ok' } };
    }
    close() {}
  }
  const io = { Mobile, validateHost: x => x, probe: async () => ({ identity: options.wrongIdentity ? 'other' : 'fixture', mobilePin: options.badPin ? 'changed' : 'pin' }), fingerprint: async () => 'pin',
    ipCall: async () => {
      if (options.ipUnavailable) throw fail('STATE_TRANSITION');
      return { inputSource: options.conflict ? 'HDMI1' : { USB_C: 'USB-C', DISPLAYPORT: 'DISPLAY PORT', HDMI1: 'HDMI1' }[actual] };
    } };
  const c = new Controller(store, io, { sampleMs: 1, verifyMs: 150 }); c.record = record; c.state.paired = true;
  return { c, options, stats: () => ({ writes, reads }), external: key => { actual = key; } };
}
test('ignores camera and untrusted labels; preserves stable port keys', () => {
  const answer = rows('USB_C'); answer.response.push({ sourceId: 'camera@USBCAM', currentSource: 'False' });
  const parsed = parseSources(answer); assert.equal(parsed.length, 3); assert.equal(parsed[0].label, 'USB-C');
  assert.throws(() => parseSources({ statusCode: '100', response: [...rows('USB_C').response, { sourceId: 'source@DISPLAYPORT', currentSource: 'True' }] }));
});
test('rejects public hosts, URLs, IPv6, loopback and injected ports', () => {
  const privateHost = [10, 0, 0, 1].join('.');
  for (const host of ['example.com', '127.0.0.1', '8.8.8.8', '::1', 'https://monitor', privateHost + ':8002', '', null]) assert.throws(() => validateHost(host));
  assert.equal(validateHost(privateHost), privateHost);
});
test('success requires two fresh samples and cross-checks independent API', async () => {
  const f = fixture(); assert.equal((await f.c.switchSource('displayport')).ok, true);
  assert.equal(f.c.state.current, 'displayport'); assert.equal(f.c.state.verification, 'dual');
  assert.equal(f.stats().writes, 1); assert.ok(f.stats().reads >= 3);
});
test('switching to current input verifies without a write', async () => {
  const f = fixture(); assert.equal((await f.c.switchSource('usb-c')).ok, true); assert.equal(f.stats().writes, 0);
});
test('accepted command alone cannot succeed', async () => {
  const f = fixture({ ignoreWrite: true }); const result = await f.c.switchSource('displayport');
  assert.equal(result.code, 'VERIFY'); assert.equal(f.c.state.current, 'usb-c'); assert.equal(f.c.state.verification, null);
});
test('disagreeing independent state prevents success', async () => {
  const f = fixture({ conflict: true }); assert.equal((await f.c.switchSource('displayport')).code, 'VERIFY');
});
test('transient IP Control failure permits two MobileBFF samples with explicit scope', async () => {
  const f = fixture({ ipUnavailable: true }); assert.equal((await f.c.switchSource('displayport')).ok, true); assert.equal(f.c.state.verification, 'mobile');
});
test('lost acknowledgement verifies without repeating the command', async () => {
  const f = fixture({ lostAck: true }); assert.equal((await f.c.switchSource('displayport')).ok, true); assert.equal(f.stats().writes, 1);
});
test('external change updates state without writing back; offline clears stale state', async () => {
  const f = fixture(); await f.c.poll(); f.external('HDMI1'); await f.c.poll();
  assert.equal(f.c.state.current, 'hdmi'); assert.match(f.c.state.message, /outside/); assert.equal(f.stats().writes, 0);
  f.options.offline = true; await f.c.poll(); assert.equal(f.c.state.current, null); assert.equal(f.c.state.updatedAt, null);
});
test('identity and certificate mismatch never reuse the saved credential', async () => {
  for (const option of ['wrongIdentity', 'badPin']) {
    const f = fixture({ [option]: true }); const r = await f.c.reconnect('local');
    assert.equal(r.code, option === 'badPin' ? 'CERTIFICATE' : 'IDENTITY'); assert.equal(f.stats().reads, 0);
  }
});
test('serializes commands and keeps secrets out of snapshots', async () => {
  const f = fixture(); const first = f.c.switchSource('displayport');
  assert.equal((await f.c.switchSource('hdmi')).code, 'BUSY'); await first;
  const snapshot = JSON.stringify(f.c.snapshot()); assert.ok(!snapshot.includes('secret')); assert.ok(!snapshot.includes('source.layer'));
});
test('remote keys enforce the whitelist and device identity before sending', async () => {
  const f = fixture(); let sent = 0; f.c.record.remoteToken = 'fixture';
  f.c.io.Remote = class { async connect() {} async sendKey() { sent++; } close() {} };
  assert.equal((await f.c.remoteKey('KEY_POWER')).code, 'UNSUPPORTED'); assert.equal(sent, 0);
  f.options.wrongIdentity = true; assert.equal((await f.c.remoteKey('KEY_ENTER')).code, 'IDENTITY'); assert.equal(sent, 0);
  f.options.wrongIdentity = false; assert.equal((await f.c.remoteKey('KEY_EXIT')).ok, true); assert.equal(sent, 1);
  assert.match(f.c.state.message, /cannot be verified/);
  assert.ok(!JSON.stringify(f.c.snapshot()).includes('remoteToken'));
});
test('dynamic source inventory accepts additional HDMI ports without private source titles', async () => {
  const list = rows('USB_C'); list.response.push({sourceId:'source@HDMI2',currentSource:'False',title:'private'});
  const result = parseSources(list); assert.equal(result.find(s=>s.key==='hdmi2').label,'HDMI 2');
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('untested hardware cannot invoke setting writes through the controller',async()=>{
  const f=fixture();f.c.record.controlProfile='read-only';assert.equal((await f.c.setSetting('volume',5,'usb-c')).code,'UNSUPPORTED');assert.equal(f.stats().writes,0);
});
test('expanded remote keys remain allowlisted and sent once',async()=>{
 const f=fixture();f.c.record.remoteToken='fixture';const keys=[];
 f.c.io.Remote=class { async connect(){} async sendKey(key){keys.push(key);} close(){} };
 for(const key of ['KEY_MENU','KEY_RETURN']) assert.equal((await f.c.remoteKey(key)).ok,true);
 assert.deepEqual(keys,['KEY_MENU','KEY_RETURN']);assert.equal((await f.c.remoteKey('KEY_FACTORY')).code,'UNSUPPORTED');
});
