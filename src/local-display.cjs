const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const run = promisify(execFile);
const key = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
function mode(width, height, refreshRate, identity, provider) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 32768 || height > 32768) return null;
  return { key: key(identity), width, height, refreshRate: Number.isFinite(refreshRate) && refreshRate > 1 && refreshRate < 2000 ? refreshRate : null, provider };
}
function parseMac(data) {
  const output = [];
  for (const gpu of data.SPDisplaysDataType || []) for (const d of gpu.spdisplays_ndrvs || []) {
    if (d.spdisplays_online !== 'spdisplays_yes') continue;
    if (d._spdisplays_displayID == null) continue;
    const raw = d._spdisplays_resolution || d.spdisplays_resolution || '';
    const m = /^(\d+)\s*x\s*(\d+)(?:\s*@\s*([\d.]+)\s*Hz)?/i.exec(raw);
    if (!m) continue;
    const identity = [d['_spdisplays_display-vendor-id'], d['_spdisplays_display-product-id'], d._spdisplays_displayID].join(':');
    const row = mode(Number(m[1]), Number(m[2]), Number(m[3]), identity, 'macOS system_profiler display mode');
    if (row) output.push(row);
  }
  return output.map((d, i) => ({ ...d, label: `Display ${i + 1}` }));
}
function parseWindows(data) {
  if (!Array.isArray(data)) throw new Error('Display query unavailable');
  return data.map(d => mode(d.width, d.height, d.refreshRate, d.identity, d.provider || 'Windows QueryDisplayConfig target mode'))
    .filter(Boolean).map((d, i) => ({ ...d, label: `Display ${i + 1}` }));
}
async function queryDisplays(platform = process.platform) {
  const options = { timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true, encoding: 'utf8' };
  if (platform === 'darwin') {
    const { stdout } = await run('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json'], options);
    return parseMac(JSON.parse(stdout));
  }
  if (platform === 'win32') {
    const file = path.join(__dirname, '../native/display-info.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    const script = await fs.readFile(file, 'utf8');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], options);
    return parseWindows(JSON.parse(stdout.replace(/^\uFEFF/, '').trim()));
  }
  throw new Error('Display query unavailable');
}
module.exports = { queryDisplays, parseMac, parseWindows };
