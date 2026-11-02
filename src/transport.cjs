const https = require('node:https');
const tls = require('node:tls');
const net = require('node:net');
const WebSocket = require('ws');

const EVENT = '/sec/tv/appdata/mobilebff';
const NAME = Buffer.from('Odyssey OLED G8 Controller').toString('base64');
const fail = (code) => Object.assign(new Error(code), { code });

function validateHost(value) {
  if (typeof value !== 'string' || net.isIP(value.trim()) !== 4) throw fail('INVALID_IP');
  const host = value.trim();
  const [a, b] = host.split('.').map(Number);
  if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) throw fail('INVALID_IP');
  return host;
}

function fingerprint(host, port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false });
    const deadline = setTimeout(() => socket.destroy(fail('OFFLINE')), 5000);
    socket.once('close', () => clearTimeout(deadline));
    socket.once('error', () => reject(fail('OFFLINE')));
    socket.once('secureConnect', () => {
      const pin = socket.getPeerCertificate().fingerprint256;
      socket.destroy();
      pin ? resolve(pin) : reject(fail('CERTIFICATE'));
    });
  });
}

// Certificate checks are scoped to these device sockets, never global TLS settings.
function jsonRequest(host, port, path, body, pin, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { Accept: 'application/json' };
    if (payload) Object.assign(headers, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    const req = https.request({ host, port, path, method: payload ? 'POST' : 'GET', headers,
      rejectUnauthorized: false, agent: false }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 1024 * 1024) req.destroy(fail('PROTOCOL'));
      });
      res.on('error', () => reject(fail('OFFLINE')));
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw fail('PROTOCOL');
          resolve(JSON.parse(data));
        } catch { reject(fail('PROTOCOL')); }
      });
    });
    const deadline = setTimeout(() => req.destroy(fail('OFFLINE')), timeout);
    req.once('close', () => clearTimeout(deadline));
    // No credentials are written before the certificate has been checked.
    req.on('socket', socket => socket.once('secureConnect', () => {
      if (pin && socket.getPeerCertificate().fingerprint256 !== pin) return req.destroy(fail('CERTIFICATE'));
      req.end(payload);
    }));
    req.setTimeout(timeout, () => req.destroy(fail('OFFLINE')));
    req.on('error', error => reject(fail(error.code === 'CERTIFICATE' ? 'CERTIFICATE' : 'OFFLINE')));
  });
}

async function probe(host) {
  validateHost(host);
  const mobilePin = await fingerprint(host, 8002);
  const data = await jsonRequest(host, 8002, '/api/v2/', undefined, mobilePin);
  const identity = data.device?.id || data.id;
  if (typeof identity !== 'string' || !identity) throw fail('PROTOCOL');
  // Device metadata never leaves the main process or encrypted local storage.
  return { identity, mobilePin };
}

async function ipCall(host, pin, method, token, timeout, parameters = {}) {
  const body = { jsonrpc: '2.0', id: 1, method };
  if (token) body.params = { ...parameters, AccessToken: token };
  const answer = await jsonRequest(host, 1516, '/', body, pin, timeout);
  const code = answer.error?.code ?? answer.code;
  if (code) throw fail(code === -32601 ? 'UNSUPPORTED' : code === -32002 ? 'STATE_TRANSITION' : 'PAIRING');
  if (!answer.result) throw fail('PROTOCOL');
  return answer.result;
}

function pinnedConnector(host, pin) {
  return (options, callback) => {
    let done = false;
    const finish = (error, socket) => {
      if (done) return;
      done = true; clearTimeout(deadline); callback(error, socket);
    };
    const socket = tls.connect({ host, port: 8002, rejectUnauthorized: false }, () => {
      if (socket.getPeerCertificate().fingerprint256 !== pin) {
        socket.destroy(); finish(fail('CERTIFICATE')); return;
      }
      finish(null, socket);
    });
    const deadline = setTimeout(() => socket.destroy(fail('OFFLINE')), 8000);
    socket.once('error', error => finish(error));
  };
}

class Remote {
  constructor(host, pin, token, clientName) { this.host = host; this.pin = pin; this.token = token; this.name = clientName ? Buffer.from(clientName).toString('base64') : NAME; }
  connect() {
    return new Promise((resolve, reject) => {
      // This channel's legacy authorization matches the raw Base64 client name.
      const query = `name=${this.name}` + (this.token ? `&token=${encodeURIComponent(this.token)}` : '');
      const ws = new WebSocket(`wss://${this.host}:8002/api/v2/channels/samsung.remote.control?${query}`, {
        createConnection: pinnedConnector(this.host, this.pin), handshakeTimeout: 8000, maxPayload: 1024 * 1024,
      });
      this.ws = ws;
      let done = false;
      const finish = error => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (error) { this.close(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => finish(fail('PAIRING')), 45000);
      ws.on('error', error => finish(fail(error.code === 'CERTIFICATE' ? 'CERTIFICATE' : 'PAIRING')));
      ws.on('close', () => finish(fail('PAIRING')));
      ws.on('message', raw => {
        try {
          const message = JSON.parse(raw.toString());
          if (message.event === 'ms.channel.connect') {
            const value = message.data?.token || this.token;
            if (!value) return finish(fail('PAIRING'));
            this.token = String(value); finish();
          } else if (['ms.channel.unauthorized', 'ms.channel.timeOut', 'ms.error'].includes(message.event)) finish(fail('PAIRING'));
        } catch { /* Unrelated device messages do not authorize this connection. */ }
      });
    });
  }
  confirmPairing() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ method: 'ms.remote.control', params: {
      Cmd: 'Click', DataOfCmd: 'KEY_ENTER', Option: 'false', TypeOfRemote: 'SendRemoteKey',
    } }), () => {});
  }
  close() { this.ws?.terminate(); this.ws = null; }
}

class Mobile {
  constructor(host, pin) {
    this.host = host; this.pin = pin; this.pending = new Map(); this.seq = 0;
  }
  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN && this.ready) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  open() {
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) { this.close(); reject(error); } else { this.ready = true; resolve(); }
      };
      // A custom TLS connector pins before WebSocket writes its handshake.
      const ws = new WebSocket(`wss://${this.host}:8002/api/v2/channels/com.samsung.tv.mobilebff?name=${encodeURIComponent(NAME)}`, {
        handshakeTimeout: 8000, maxPayload: 1024 * 1024,
        createConnection: pinnedConnector(this.host, this.pin),
      });
      this.ws = ws;
      const timer = setTimeout(() => finish(fail('OFFLINE')), 10000);
      ws.on('error', error => finish(fail(error.code === 'CERTIFICATE' ? 'CERTIFICATE' : 'OFFLINE')));
      ws.on('close', () => {
        if (this.ws !== ws) return;
        this.ready = false;
        finish(fail('OFFLINE'));
        this.rejectPending();
      });
      ws.on('message', raw => {
        if (this.ws !== ws) return;
        try {
          const m = JSON.parse(raw.toString());
          if (['ms.channel.unauthorized', 'ms.channel.timeOut', 'ms.error'].includes(m.event)) return finish(fail('PAIRING'));
          if (m.event !== EVENT) return;
          const d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data;
          if (d?.id === 'notify.service.status' && d.response?.status === 'ready') finish();
          const item = this.pending.get(String(d?.seqId));
          if (item && item.method === d.id) {
            this.pending.delete(String(d.seqId)); clearTimeout(item.timer); item.resolve(d);
          }
        } catch { /* Ignore malformed and unrelated device broadcasts. */ }
      });
    });
  }
  async request(method, params = {}) {
    await this.connect();
    const seqId = String(++this.seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(seqId); reject(fail('OFFLINE')); }, 6000);
      this.pending.set(seqId, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify({ method: 'ms.channel.emit', params: { event: EVENT, to: 'host',
        data: JSON.stringify({ version: '0.1', id: method, seqId, params }) } }), error => {
        if (error) { clearTimeout(timer); this.pending.delete(seqId); reject(fail('OFFLINE')); }
      });
    });
  }
  rejectPending() {
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(fail('OFFLINE')); }
    this.pending.clear();
  }
  close() { this.ready = false; this.ws?.terminate(); this.ws = null; this.rejectPending(); }
}

module.exports = { validateHost, fingerprint, jsonRequest, probe, ipCall, Mobile, Remote, fail };
