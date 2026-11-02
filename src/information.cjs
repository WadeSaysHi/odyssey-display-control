const { fail } = require('./transport.cjs');
const INPUT = { 'usb-c': 'USB-C', displayport: 'DISPLAY PORT', hdmi: 'HDMI1' };
const SETTINGS = {
  volume: { label: 'Volume', group: 'sound', method: 'directVolumeControl', field: 'volume', min: 0, max: 100 },
  mute: { label: 'Mute', group: 'sound', method: 'muteControl', field: 'mute', choices: ['muteOff', 'muteOn'] },
  backlight: { label: 'Backlight API level', group: 'picture', method: 'backlightControl', field: 'backlight', min: 0, max: 50 },
  contrast: { label: 'Contrast', group: 'picture', method: 'contrastControl', field: 'contrast', min: 0, max: 50 },
  sharpness: { label: 'Sharpness', group: 'picture', method: 'sharpnessControl', field: 'sharpness', min: 0, max: 20 },
};
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[\w .+()/-]+$/.test(value) ? value : null;
function valid(setting, value) {
  return setting.choices ? setting.choices.includes(value) : typeof value === 'number' && Number.isInteger(value) && value >= setting.min && value <= setting.max;
}
function empty() {
  return { monitor: { status: 'unknown', at: null, attemptedAt: null, input: null, values: {}, controls: {}, error: '' },
    computer: { status: 'unknown', at: null, attemptedAt: null, displays: [], error: '' } };
}
function presentation(report, current, online, association = {}, now = Date.now()) {
  association ||= {};
  const m = report.monitor, pc = report.computer;
  const monitorFresh = online && m.status === 'fresh' && now - m.at < 30000 && m.input === current;
  const computerFresh = pc.status === 'fresh' && now - pc.at < 30000;
  const display = pc.displays.find(d => d.key === association.displayKey);
  const usable = monitorFresh && computerFresh && display && association.input === current;
  const field = (value, source, status, note) => ({ value, source, status, note });
  const monitorField = name => {
    const value = m.input === current ? m.values[name] : null;
    return field(value ?? (m.status === 'unavailable' ? 'Unavailable' : 'Unknown'), 'Monitor',
      value == null ? m.status === 'unavailable' ? 'unavailable' : 'unknown' : monitorFresh ? 'verified' : 'stale',
      value == null ? 'No verified value returned.' : monitorFresh ? 'Queried from the monitor for this input.' : 'Last known value; refresh required.');
  };
  const fields = { resolution: field('Unknown', 'Monitor', 'unknown', 'The monitor API does not expose verified live input timing.'),
    refreshRate: field('Unknown', 'Monitor', 'unknown', 'No verified live refresh-rate query. Hz is not real-time FPS.'),
    vrr: field('Unknown', 'Monitor', 'unknown', 'No verified VRR-status query.'),
    hdr: field('Unknown', 'Monitor', 'unknown', 'No verified HDR-status query. Picture mode does not prove HDR.'),
    pictureMode: monitorField('pictureMode'), soundMode: monitorField('soundMode'), volume: monitorField('volume') };
  if (!online) for (const key of ['resolution', 'refreshRate', 'vrr', 'hdr']) fields[key] = field('Unavailable', 'Monitor', 'unavailable', 'Monitor input is unverified while disconnected.');
  if (usable) {
    fields.resolution = field(`${display.width} × ${display.height}`, 'This Computer', 'verified', `${display.provider}; configured input association. Monitor timing is unverified.`);
    fields.refreshRate = field(display.refreshRate ? `${Number(display.refreshRate.toFixed(3))} Hz` : 'Unknown', 'This Computer', display.refreshRate ? 'verified' : 'unknown', 'OS display mode for the configured input. This is not a real-time FPS counter.');
  }
  return { fields, monitorFresh, computerFresh, association, monitor: m, computer: pc,
    controls: Object.entries(SETTINGS).map(([key, definition]) => ({ key, ...definition, value: m.controls[key] ?? null,
      enabled: monitorFresh && valid(definition, m.controls[key]) })) };
}
class Information {
  constructor(controller, queryDisplays = async () => []) { this.c = controller; this.queryDisplays = queryDisplays; this.report = empty(); this.lastAttempt = 0; }
  snapshot() { return presentation(this.report, this.c.state.current, this.c.state.status === 'online', this.c.record?.association); }
  publish() { this.c.update({ information: this.snapshot() }); }
  invalidate() {
    this.lastAttempt = 0;
    this.report.monitor = { ...empty().monitor, status: 'unknown', error: 'Input changed. Refresh required.' };
    this.publish();
  }
  async call(method, parameters) {
    const r = this.c.record;
    if (!r) throw fail('PAIRING');
    return this.c.io.ipCall(r.host, r.ipPin, method, r.token, 4000, parameters);
  }
  async optional(method) {
    try { return await this.call(method); }
    catch (error) { if (['OFFLINE', 'CERTIFICATE'].includes(error.code)) throw error; return null; }
  }
  async readComputer() {
    const attemptedAt = Date.now();
    try {
      const displays = await this.queryDisplays();
      if (!displays.length) throw fail('UNSUPPORTED');
      this.report.computer = { status: 'fresh', at: Date.now(), attemptedAt, displays, error: '' };
    } catch {
      this.report.computer = { ...this.report.computer, status: 'unavailable', attemptedAt, error: 'Computer display query failed or is unavailable in this session.' + (this.report.computer.at ? ' Retained values are stale.' : '') };
    }
  }
  async readMonitor() {
    const attemptedAt = Date.now();
    try {
      if (!this.c.record || this.c.state.status !== 'online') throw fail('OFFLINE');
      const before = await this.call('getTVStates');
      const input = this.c.state.current;
      if (!input || before.inputSource !== INPUT[input]) throw fail('SETTING_CONTEXT');
      const video = await this.optional('getVideoStates');
      const controls = {};
      for (const [key, definition] of Object.entries(SETTINGS)) {
        const response = await this.optional(definition.method);
        const value = response?.[definition.field];
        if (valid(definition, value)) controls[key] = value;
      }
      const after = await this.call('getTVStates');
      await this.c.refresh();
      if (before.inputSource !== after.inputSource || this.c.state.current !== input) throw fail('SETTING_CONTEXT');
      this.report.monitor = { status: 'fresh', at: Date.now(), attemptedAt, input, error: '', controls,
        values: { pictureMode: text(after.pictureMode), soundMode: text(after.soundMode),
          volume: valid(SETTINGS.volume, after.volume) ? after.volume : null,
          brightnessRaw: typeof video?.brightness === 'number' ? video.brightness : null } };
    } catch (error) {
      const contextChanged = error.code === 'SETTING_CONTEXT';
      this.report.monitor = { ...(contextChanged ? empty().monitor : this.report.monitor), status: 'unavailable', attemptedAt,
        error: !this.c.record ? 'Pair the monitor to read its details.' : contextChanged ? 'Input changed during the query. Refresh to read the new input.' :
          'Monitor detail query failed; controls are disabled.' + (this.report.monitor.at ? ' Retained values are stale.' : '') };
    }
  }
  async read() {
    this.lastAttempt = Date.now();
    await Promise.allSettled([this.readComputer(), this.readMonitor()]);
    this.publish();
  }
  async set(key, value) {
    const definition = SETTINGS[key];
    if (!definition || !valid(definition, value)) throw fail('INVALID_SETTING');
    await this.c.refresh();
    const input = this.c.state.current;
    const before = await this.call('getTVStates');
    if (!input || before.inputSource !== INPUT[input]) throw fail('SETTING_CONTEXT');
    const getter = await this.call(definition.method);
    if (!valid(definition, getter[definition.field])) throw fail('UNSUPPORTED');
    await this.call(definition.method, { [definition.field]: value });
    for (let sample = 0; sample < 2; sample++) {
      const actual = await this.call(definition.method);
      const context = await this.call('getTVStates');
      await this.c.refresh();
      if (context.inputSource !== before.inputSource || this.c.state.current !== input) throw fail('SETTING_CONTEXT');
      if (actual[definition.field] !== value) throw fail('SETTING_VERIFY');
    }
    await this.read();
    this.c.update({ message: `${definition.label} confirmed by two fresh monitor reads.` });
  }
}
module.exports = { Information, presentation, empty, SETTINGS };
