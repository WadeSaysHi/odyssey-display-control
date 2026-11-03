const { EventEmitter } = require('node:events');
const transport = require('./transport.cjs');
const { Information } = require('./information.cjs');
const PORTS = {
  USB_C: { key: 'usb-c', label: 'USB-C', ip: 'USB-C' },
  DISPLAYPORT: { key: 'displayport', label: 'DisplayPort', ip: 'DISPLAY PORT' },
  HDMI1: { key: 'hdmi', label: 'HDMI', ip: 'HDMI1' },
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const messages = {
  TARGET: 'The selected display changed. Review the target before trying again.',
  DUPLICATE: 'This display is already saved. Select its existing connection.',
  INVALID_IP: 'Enter a private IPv4 address from your local network.',
  OFFLINE: 'Cannot reach the monitor. Check its power and network, then reconnect.',
  CERTIFICATE: 'The monitor certificate changed. Forget this connection and pair again after checking the address.',
  IDENTITY: 'A different device answered at this address. Check the address or forget this connection.',
  PAIRING: 'Pairing was denied or expired. Choose Pair and allow access on the monitor.',
  STORAGE: 'Secure credential storage is unavailable. Unlock your OS credential store and try again.',
  PROTOCOL: 'The monitor returned an unsupported response. Try reconnecting.',
  VERIFY: 'The requested input could not be confirmed. The displayed input is the latest observed state.',
  BUSY: 'Wait for the current operation to finish.',
  UNSUPPORTED: 'This control is unavailable from the monitor in the current mode.',
  INVALID_SETTING: 'Choose a value within the supported control range.',
  SETTING_CONTEXT: 'The input changed during the operation. Refresh before changing settings.',
  SETTING_VERIFY: 'The monitor did not confirm the requested setting. Refresh to check its actual value.',
  STATE_TRANSITION: 'The monitor is changing state or has locked this control. Refresh and try again.',
};
function parseSources(answer) {
  if (String(answer?.statusCode) !== '100' || !Array.isArray(answer.response)) throw transport.fail('PROTOCOL');
  const sources = [];
  for (const item of answer.response) {
    if (typeof item.sourceId !== 'string') continue;
    const suffix = item.sourceId.split('@').pop();
    const port = PORTS[suffix] || (/^HDMI[2-4]$/.test(suffix) ? { key: suffix.toLowerCase(), label: `HDMI ${suffix.slice(-1)}`, ip: suffix } : /^DISPLAYPORT[12]$/.test(suffix) ? { key: suffix.toLowerCase(), label: `DisplayPort ${suffix.slice(-1)}`, ip: null } : null);
    if (!port) continue;
    if (sources.some(x => x.key === port.key)) throw transport.fail('PROTOCOL');
    sources.push({ ...port, id: item.sourceId, current: String(item.currentSource).toLowerCase() === 'true' });
  }
  if (!sources.length || sources.filter(x => x.current).length > 1) throw transport.fail('PROTOCOL');
  return sources;
}

class Controller extends EventEmitter {
  constructor(store, io = transport, options = {}) {
    super(); this.store = store; this.io = io; this.options = options;
    this.state = { host: '', paired: false, status: 'setup', current: null, sources: [], updatedAt: null,
      busy: false, message: 'Connect your monitor to get started.', verification: null, autoConfirm: true };
    this.information = new Information(this, options.queryDisplays);
    this.state.information = this.information.snapshot();
  }
  snapshot() { return structuredClone({ ...this.state, controlProfile: this.record?.controlProfile || 'read-only', remoteAvailable: Boolean(this.record?.remoteToken) }); }
  update(patch) { Object.assign(this.state, patch); this.state.information = this.information.snapshot(); this.emit('state', this.snapshot()); }
  async init() {
    this.timer = setInterval(() => void this.poll(), this.options.pollMs || 3000);
    this.record = await this.store.load();
    if (this.record) this.update({ host: this.record.host, paired: true, status: 'offline', message: 'Connecting…', autoConfirm: this.record.autoConfirm ?? true });
    await this.poll();
    if (this.state.status === 'online') this.update({ message: 'Connected. Current input refreshed.' });
  }
  async exclusive(work) {
    if (this.state.busy) return { ok: false, code: 'BUSY', message: messages.BUSY };
    this.update({ busy: true });
    try {
      while (this.polling) await delay(10);
      await work(); return { ok: true };
    }
    catch (error) {
      const code = messages[error.code] ? error.code : 'OFFLINE';
      if (['OFFLINE', 'IDENTITY', 'CERTIFICATE'].includes(code)) {
        this.mobile?.close(); this.mobile = null;
        this.update({ status: 'offline', current: null, sources: [], updatedAt: null });
      }
      this.update({ message: messages[code], verification: null });
      return { ok: false, code, message: messages[code] };
    } finally { this.update({ busy: false }); }
  }
  async pair(value, options = {}) {
    return this.exclusive(async () => {
      const host = this.io.validateHost(value);
      const device = await this.io.probe(host);
      if (this.record && device.identity !== this.record.identity) throw transport.fail('IDENTITY');
      if (this.record && device.mobilePin !== this.record.mobilePin) throw transport.fail('CERTIFICATE');
      const ipPin = await this.io.fingerprint(host, 1516);
      if (this.record && ipPin !== this.record.ipPin) throw transport.fail('CERTIFICATE');
      let remote, confirmTimer, result;
      try {
        if (options.autoConfirm) {
          this.update({ message: this.record?.remoteToken ? 'Reusing your authorized remote connection…' : 'Allow this app’s remote connection on the monitor once…' });
          remote = new this.io.Remote(host, device.mobilePin, this.record?.remoteToken, this.record?.remoteName);
          await remote.connect();
        }
        this.update({ message: remote ? 'Pairing… The authorized remote will send one OK if the request remains pending.' : 'Allow the pairing request on your monitor…' });
        const request = this.io.ipCall(host, ipPin, 'createAccessToken', null, 45000);
        if (remote) confirmTimer = setTimeout(() => remote.confirmPairing(), this.options.confirmDelayMs || 2000);
        result = await request;
      } finally { clearTimeout(confirmTimer); remote?.close(); }
      if (typeof result.AccessToken !== 'string' || !result.AccessToken) throw transport.fail('PAIRING');
      const record = { ...device, host, ipPin, token: result.AccessToken, autoConfirm: Boolean(options.autoConfirm), controlProfile: ['oled-g8-tested', 'read-only'].includes(options.controlProfile) ? options.controlProfile : this.record?.controlProfile || 'read-only',
        ...(this.record?.association ? { association: this.record.association } : {}),
        ...(this.record?.remoteName ? { remoteName: this.record.remoteName } : {}),
        ...(remote?.token ? { remoteToken: remote.token } : this.record?.remoteToken ? { remoteToken: this.record.remoteToken } : {}) };
      await this.store.save(record);
      this.mobile?.close(); this.mobile = null; this.record = record;
      this.update({ host, paired: true, current: null, sources: [], updatedAt: null, autoConfirm: record.autoConfirm });
      await this.refresh();
      this.update({ message: 'Paired. Choose an input.' });
    });
  }
  async reconnect(value) {
    return this.exclusive(async () => {
      if (!this.record) throw transport.fail('PAIRING');
      const host = this.io.validateHost(value);
      const device = await this.io.probe(host);
      if (device.identity !== this.record.identity) throw transport.fail('IDENTITY');
      if (device.mobilePin !== this.record.mobilePin) throw transport.fail('CERTIFICATE');
      const ipPin = await this.io.fingerprint(host, 1516);
      if (ipPin !== this.record.ipPin) throw transport.fail('CERTIFICATE');
      const record = { ...this.record, host };
      await this.store.save(record);
      this.mobile?.close(); this.mobile = null; this.record = record;
      this.update({ host, current: null, updatedAt: null, verification: null });
      await this.refresh(); this.update({ message: 'Connected. Current input refreshed.' });
    });
  }
  async forget() {
    return this.exclusive(async () => {
      await this.store.clear(); this.record = null; this.mobile?.close(); this.mobile = null;
      this.information.invalidate();
      this.update({ host: '', paired: false, status: 'setup', current: null, sources: [], updatedAt: null,
        verification: null, message: 'Connection forgotten. Pair to connect again.' });
    });
  }
  async refresh() {
    if (!this.record) return;
    try {
      if (!this.mobile) {
        const device = await this.io.probe(this.record.host);
        if (device.identity !== this.record.identity) throw transport.fail('IDENTITY');
        if (device.mobilePin !== this.record.mobilePin) throw transport.fail('CERTIFICATE');
        this.mobile = new this.io.Mobile(this.record.host, this.record.mobilePin);
      }
      const sources = parseSources(await this.mobile.request('get.extsources'));
      const current = sources.find(x => x.current)?.key || null;
      if (current !== this.state.current) this.information.invalidate();
      // Only allow known input keys and labels across the renderer boundary.
      this.update({ status: 'online', current, sources: sources.map(({ key, label }) => ({ key, label })), updatedAt: Date.now() });
      return sources;
    } catch (error) {
      this.mobile?.close(); this.mobile = null;
      this.update({ status: 'offline', current: null, sources: [], updatedAt: null, verification: null });
      throw error;
    }
  }
  async poll() {
    if (this.state.busy || this.polling) return;
    this.polling = true;
    try {
      const before = this.state.current;
      if (this.record) await this.refresh();
      if (before && before !== this.state.current) this.update({ verification: null, message: 'Input changed outside the app. Current input updated.' });
    } catch (error) {
      this.update({ message: messages[error.code] || messages.OFFLINE });
    } finally {
      try { if (Date.now() - this.information.lastAttempt > 15000) await this.information.read(); }
      finally { this.polling = false; }
    }
  }
  refreshInformation() {
    return this.exclusive(async () => {
      try { if (this.record) await this.refresh(); }
      finally { await this.information.read(); }
    });
  }
  setSetting(key, value, expectedInput = this.state.current) {
    return this.exclusive(async () => {
      try {
        if (this.record?.controlProfile !== 'oled-g8-tested') throw transport.fail('UNSUPPORTED');
        await this.information.set(key, value, expectedInput); }
      catch (error) {
        this.information.report.monitor.status = 'unavailable';
        this.information.report.monitor.error = messages[error.code] || messages.SETTING_VERIFY;
        this.information.publish(); throw error;
      }
    });
  }
  remoteKey(key) {
    return this.exclusive(async () => {
      if (!['KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER', 'KEY_SOURCE', 'KEY_EXIT', 'KEY_MENU', 'KEY_RETURN'].includes(key)) throw transport.fail('UNSUPPORTED');
      if (!this.record?.remoteToken) throw transport.fail('PAIRING');
      const device = await this.io.probe(this.record.host);
      if (device.identity !== this.record.identity) throw transport.fail('IDENTITY');
      if (device.mobilePin !== this.record.mobilePin) throw transport.fail('CERTIFICATE');
      const remote = new this.io.Remote(this.record.host, this.record.mobilePin, this.record.remoteToken, this.record.remoteName);
      try { await remote.connect(); await remote.sendKey(key); }
      finally { remote.close(); }
      this.update({ message: 'Remote key sent. Menu changes cannot be verified by the monitor API.' });
    });
  }
  associateComputer(input, displayKey) {
    return this.exclusive(async () => {
      if (!this.record) throw transport.fail('PAIRING');
      if (input !== '' && (!this.state.sources.some(port => port.key === input) ||
        !this.information.report.computer.displays.some(d => d.key === displayKey) || this.information.report.computer.status !== 'fresh')) throw transport.fail('INVALID_SETTING');
      const record = { ...this.record, association: input ? { input, displayKey } : null };
      await this.store.save(record); this.record = record;
      this.update({ message: input ? 'This computer display and input association saved.' : 'Computer association cleared.' });
    });
  }
  async switchSource(key) {
    return this.exclusive(async () => {
      if (!this.record) throw transport.fail('PAIRING');
      if (typeof key !== 'string') throw transport.fail('PROTOCOL');
      const rows = await this.refresh();
      const target = rows.find(x => x.key === key);
      if (!target) throw transport.fail('PROTOCOL');
      this.update({ message: `Confirming ${target.label}…`, verification: null });
      if (!target.current) {
        try {
          const ack = await this.mobile.request('launch.extsource', { requestId: target.id });
          if (String(ack.statusCode) !== '100' || ack.response?.status !== 'ok') throw transport.fail('VERIFY');
        } catch (error) {
          if (error.code === 'VERIFY') throw error;
          // A lost acknowledgement must not cause a repeated write. Read instead.
        }
      }
      const deadline = Date.now() + (this.options.verifyMs || 20000);
      let matches = 0, independent = false;
      while (Date.now() < deadline) {
        await delay(this.options.sampleMs || 250);
        try {
          const fresh = await this.refresh();
          let agrees = true; independent = false;
          try {
            const tv = await this.io.ipCall(this.record.host, this.record.ipPin, 'getTVStates', this.record.token);
            if (target.ip) { agrees = tv.inputSource === target.ip; independent = agrees; }
          } catch (error) {
            if (error.code === 'CERTIFICATE') throw error;
            // IP Control can transiently refuse reads during a source transition.
          }
          matches = fresh.find(x => x.key === key)?.current && agrees ? matches + 1 : 0;
          if (matches >= 2) {
            this.update({ verification: independent ? 'dual' : 'mobile',
              message: `${target.label} confirmed${independent ? ' by both local state APIs' : ' by two fresh monitor reads'}.` });
            return;
          }
        } catch (error) { if (error.code === 'CERTIFICATE') throw error; matches = 0; }
      }
      throw transport.fail('VERIFY');
    });
  }
  close() { clearInterval(this.timer); this.mobile?.close(); }
}
module.exports = { Controller, parseSources, messages };
