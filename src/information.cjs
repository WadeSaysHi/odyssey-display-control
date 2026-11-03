const { fail } = require('./transport.cjs');
const {resolveInput}=require('./sources.cjs');
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
function presentation(report, current, online, association = {}, now = Date.now(), inputFresh = false) {
  association ||= {};
  const m = report.monitor, pc = report.computer;
  const monitorFresh = online && m.status === 'fresh' && now - m.at < 30000 && m.input === current;
  const computerFresh = pc.status === 'fresh' && now - pc.at < 30000;
  const display = pc.displays.find(d => d.key === association.displayKey);
  const usable = online && (monitorFresh || inputFresh) && computerFresh && display && association.input === current;
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
  snapshot() { const info = presentation(this.report, this.c.state.current, this.c.state.status === 'online', this.c.record?.association, Date.now(), !this.report.monitor.inputConflict&&this.c.state.status==='online'&&this.c.state.current!==null&&Date.now()-this.c.state.updatedAt<30000);
    for(const c of info.controls)c.disabledReason=c.enabled?'':!info.monitorFresh?'Readings are unavailable or stale. Refresh.':'This setting is unavailable from the monitor.';
    if (this.c.record?.controlProfile !== 'oled-g8-tested') info.controls.forEach(c => { c.enabled = false; c.disabledReason='Read-only control profile. Choose the tested G8 profile in Connection and Save controls.'; });
    if(this.c.options?.speakers && this.c.options.speakers()!=='yes') info.controls.filter(c=>c.group==='sound').forEach(c=>{c.enabled=false;c.disabledReason=this.c.options.speakers()==='no'?'This display has no built-in speakers.':'Speaker availability is unknown. Confirm it in Connection.';});
    return info; }
  publish() { this.c.update({ information: this.snapshot() }); }
  invalidate() {
    this.lastAttempt = 0;
    this.report.monitor = { ...empty().monitor, status: 'unknown', error: 'Input changed. Refresh required.' };
    this.publish();
  }
  matches(value,key) {
    const inventory=this.c.inventory || [];
    return resolveInput(value,inventory)===key;
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
    let inputConflict=this.report.monitor.inputConflict||false;
    try {
      if (!this.c.record || this.c.state.status !== 'online') throw fail('OFFLINE');
      const before = await this.call('getTVStates');
      const input = this.c.state.current;
      const beforeInput=resolveInput(before.inputSource,this.c.inventory||[]);
      if(beforeInput!==null)inputConflict=beforeInput!==input;
      if (!input || !this.matches(before.inputSource,input)) throw fail('SETTING_CONTEXT');
      const video = await this.optional('getVideoStates');
      const tone = await this.optional('colorToneControl');
      const power = await this.optional('powerControl');
      const controls = {};
      for (const [key, definition] of Object.entries(SETTINGS)) {
        const response = await this.optional(definition.method);
        const value = response?.[definition.field];
        if (valid(definition, value)) controls[key] = value;
      }
      const after = await this.call('getTVStates');
      await this.c.refresh();
      const afterInput=resolveInput(after.inputSource,this.c.inventory||[]);
      if(afterInput!==null)inputConflict=afterInput!==input;
      if (!this.matches(after.inputSource,input) || this.c.state.current !== input) throw fail('SETTING_CONTEXT');
      this.report.monitor = { status: 'fresh', at: Date.now(), attemptedAt, input, inputConflict:false, error: '', controls,
        values: { pictureMode: text(after.pictureMode), soundMode: text(after.soundMode),
          volume: valid(SETTINGS.volume, after.volume) ? after.volume : null,
          speakerOutput: /^(internal|external)$/i.test(after.speakerSelect || '') ? after.speakerSelect.toLowerCase() === 'internal' ? 'Internal' : 'External' : null,
          colorTone: text(tone?.colorTone), color: Number.isFinite(video?.color) ? video.color : null,
          tint: Number.isFinite(video?.tint) ? video.tint : null,
          power: power?.power === 'powerOn' ? 'On' : power?.power === 'powerOff' ? 'Off' : null } };
    } catch (error) {
      const contextChanged = error.code === 'SETTING_CONTEXT';
      this.report.monitor = { ...(contextChanged ? empty().monitor : this.report.monitor), status: 'unavailable', attemptedAt, inputConflict,
        error: !this.c.record ? 'Pair the monitor to read its details.' : contextChanged ? 'Input changed during the query. Refresh to read the new input.' :
          'Monitor detail query failed; controls are disabled.' + (this.report.monitor.at ? ' Retained values are stale.' : '') };
    }
  }
  async read() {
    this.lastAttempt = Date.now();
    await Promise.allSettled([this.readComputer(), this.readMonitor()]);
    this.publish();
  }
  async set(key, value, expectedInput = this.c.state.current) {
    const definition = SETTINGS[key];
    if (!definition || !valid(definition, value)) throw fail('INVALID_SETTING');
    await this.c.refresh();
    const input = this.c.state.current;
    const before = await this.call('getTVStates');
    if (!input || input !== expectedInput || !this.matches(before.inputSource,input)) throw fail('SETTING_CONTEXT');
    const getter = await this.call(definition.method);
    if (!valid(definition, getter[definition.field])) throw fail('UNSUPPORTED');
    await this.call(definition.method, { [definition.field]: value });
    for (let sample = 0; sample < 2; sample++) {
      const actual = await this.call(definition.method);
      const context = await this.call('getTVStates');
      await this.c.refresh();
      if (!this.matches(context.inputSource,input) || this.c.state.current !== input) throw fail('SETTING_CONTEXT');
      if (actual[definition.field] !== value) throw fail('SETTING_VERIFY');
    }
    // The two fresh getter/context pairs above already verified this setting.
    // Do not block Apply on unrelated picture getters or an OS display query.
    const previous = this.report.monitor;
    const sameInput = previous.input === input;
    this.report.monitor = { ...(sameInput ? previous : empty().monitor),
      input, status: sameInput ? previous.status : 'fresh',
      at: sameInput ? previous.at : Date.now(), error: sameInput ? previous.error : '',
      controls: { ...(sameInput ? previous.controls : {}), [key]: value },
      values: { ...(sameInput ? previous.values : {}), ...(key === 'volume' ? { volume: value } : {}) } };
    this.lastAttempt = 0; // Refresh remaining telemetry on the next idle poll.
    this.publish();
    this.c.update({ message: `${definition.label} confirmed by two fresh monitor reads.` });
  }
}
module.exports = { Information, presentation, empty, SETTINGS };
