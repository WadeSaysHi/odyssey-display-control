const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presentation, empty, Information } = require('../src/information.cjs');
const { parseMac, parseWindows } = require('../src/local-display.cjs');
const { fail } = require('../src/transport.cjs');
function report() {
  const r = empty(), now = Date.now();
  r.monitor = { status: 'fresh', at: now, input: 'usb-c', values: { pictureMode: 'GamePCHDR', soundMode: 'Game', volume: 0 }, controls: { volume: 0 } };
  r.computer = { status: 'fresh', at: now, displays: [{ key: 'fixture', label: 'Display 1', width: 2048, height: 1152, refreshRate: 75.5, provider: 'OS display mode' }] };
  return r;
}
test('OS display mode requires an explicit matching input and display association', () => {
  const r = report(); const association = { input: 'usb-c', displayKey: 'fixture' };
  assert.equal(presentation(r, 'usb-c', true).fields.resolution.value, 'Unknown');
  const matching = presentation(r, 'usb-c', true, association);
  assert.equal(matching.fields.resolution.value, '2048 × 1152'); assert.equal(matching.fields.resolution.source, 'This Computer');
  assert.equal(matching.fields.refreshRate.value, '75.5 Hz');
  assert.equal(presentation(r, 'hdmi', true, association).fields.resolution.value, 'Unknown');
  assert.equal(presentation(r, 'displayport', true, association).fields.refreshRate.value, 'Unknown');
  assert.equal(presentation(r, 'usb-c', false, association).fields.resolution.value, 'Unavailable');
  assert.equal(presentation(r, 'usb-c', true, null).fields.resolution.value, 'Unknown');
});
test('HDR is unknown even for GamePCHDR; zero volume is preserved', () => {
  const p = presentation(report(), 'usb-c', true);
  assert.equal(p.fields.pictureMode.value, 'GamePCHDR'); assert.equal(p.fields.hdr.value, 'Unknown');
  assert.equal(p.fields.vrr.value, 'Unknown'); assert.equal(p.fields.volume.value, 0);
});
test('expired or failed snapshots cannot enable controls or claim current computer timing', () => {
  const r = report(); const p = presentation(r, 'usb-c', true, { input: 'usb-c', displayKey: 'fixture' }, Date.now() + 31000);
  assert.equal(p.monitorFresh, false); assert.equal(p.fields.volume.status, 'stale'); assert.equal(p.controls[0].enabled, false);
  assert.equal(p.fields.resolution.value, 'Unknown');
  r.monitor.status = 'unavailable'; assert.equal(presentation(r, 'usb-c', true).fields.pictureMode.status, 'stale');
});
test('Mac display parser reads runtime modes and strips model and hardware identifiers', () => {
  const parsed = parseMac({ SPDisplaysDataType: [{ spdisplays_ndrvs: [{ _name: 'private model', _spdisplays_displayID: 'private-id', spdisplays_online: 'spdisplays_yes', _spdisplays_resolution: '2560 x 1600 @ 90.00Hz' }] }] });
  assert.equal(parsed[0].width, 2560); assert.equal(parsed[0].refreshRate, 90);
  assert.ok(!JSON.stringify(parsed).includes('private')); assert.equal(parsed[0].label, 'Display 1');
  assert.equal(parseWindows([{ identity: 'private-id', width: 1920, height: 1080, refreshRate: 59.94 }])[0].refreshRate, 59.94);
});
function fixture({ noApply = false, changeInput = false, failMonitor = false, failComputer = false } = {}) {
  let current = 'usb-c', volume = 5, writes = 0;
  const c = { state: { current, status: 'online' }, record: {}, update() {}, refresh: async () => {}, io: { ipCall: async (_host, _pin, method, _token, _timeout, params) => {
    if (failMonitor) throw fail('OFFLINE');
    if (method === 'getTVStates') return { inputSource: current === 'usb-c' ? 'USB-C' : 'HDMI1', pictureMode: 'GamePCHDR', soundMode: 'Game', volume };
    if (method === 'directVolumeControl') { if (params) { writes++; if (!noApply) volume = params.volume; if (changeInput) current = c.state.current = 'hdmi'; } return { volume }; }
    throw fail('UNSUPPORTED');
  } } };
  return { c, info: new Information(c, async () => { if (failComputer) throw Error('unavailable'); return report().computer.displays; }), writes: () => writes };
}
test('a setting acknowledgement without read-back cannot count as success', async () => {
  const f = fixture({ noApply: true }); await assert.rejects(f.info.set('volume', 6), { code: 'SETTING_VERIFY' }); assert.equal(f.writes(), 1);
});
test('CEC/input changes during a setting write reject confirmation without repeating the write', async () => {
  const f = fixture({ changeInput: true }); await assert.rejects(f.info.set('volume', 6), { code: 'SETTING_CONTEXT' }); assert.equal(f.writes(), 1);
});
test('monitor and computer queries fail independently; stale values are retained visibly', async () => {
  const f = fixture({ failMonitor: true }); await f.info.read();
  assert.equal(f.info.report.monitor.status, 'unavailable'); assert.equal(f.info.report.computer.status, 'fresh');
  const other = fixture({ failComputer: true }); await other.info.read();
  assert.equal(other.info.report.monitor.status, 'fresh'); assert.equal(other.info.report.computer.status, 'unavailable');
});
test('settings enforce ranges before writing and perform read-back on success', async () => {
  const f = fixture(); await assert.rejects(f.info.set('volume', 101), { code: 'INVALID_SETTING' }); assert.equal(f.writes(), 0);
  await f.info.set('volume', 6); assert.equal(f.info.report.monitor.values.volume, 6);
});
test('failed computer refresh retains the previous timestamp while withdrawing current-input timing', async () => {
  const f = fixture(); await f.info.read(); const at = f.info.report.computer.at;
  f.c.record.association = { input: 'usb-c', displayKey: 'fixture' };
  f.info.queryDisplays = async () => { throw Error('failed'); }; await f.info.read();
  assert.equal(f.info.report.computer.at, at); assert.equal(f.info.report.computer.displays.length, 1);
  assert.equal(f.info.snapshot().fields.resolution.value, 'Unknown'); assert.equal(f.info.snapshot().computerFresh, false);
});
test('new readings are sanitized and never expand the writable setting whitelist', async () => {
  const f = fixture(); const original = f.c.io.ipCall;
  f.c.io.ipCall = async (...args) => {
    if (args[2] === 'colorToneControl') return { colorTone: 'Standard' };
    if (args[2] === 'powerControl') return { power: 'powerOn' };
    if (args[2] === 'getVideoStates') return { color: 25, tint: 0 };
    const result = await original(...args);
    if (args[2] === 'getTVStates') result.speakerSelect = 'untrusted-device-identifier';
    return result;
  };
  await f.info.read(); assert.equal(f.info.report.monitor.values.colorTone, 'Standard');
  assert.equal(f.info.report.monitor.values.tint, 0); assert.equal(f.info.report.monitor.values.speakerOutput, null);
  assert.equal(f.info.report.monitor.values.power, 'On');
  for (const key of ['color', 'tint', 'colorTone', 'power', 'speakerOutput']) await assert.rejects(f.info.set(key, 1), { code: 'INVALID_SETTING' });
  assert.equal(f.writes(), 0);
});
test('external input change before Apply cannot retarget an old input draft', async () => {
  const f = fixture();
  f.c.refresh = async () => { f.c.state.current = 'hdmi'; };
  await assert.rejects(f.info.set('volume', 6, 'usb-c'), { code: 'SETTING_CONTEXT' });
  assert.equal(f.writes(), 0);
});
