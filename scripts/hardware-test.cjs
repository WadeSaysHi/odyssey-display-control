// Opt-in live test: changes the monitor input and restores the original source.
// Keep credentials and reports outside the repository. Never print device metadata.
const fs = require('node:fs');
const { Controller } = require('../src/controller.cjs');
const t = require('../src/transport.cjs');
(async () => {
  const host = t.validateHost(process.env.ODYSSEY_HOST);
  const device = await t.probe(host);
  const ipPin = await t.fingerprint(host, 1516);
  const token = process.env.ODYSSEY_CREDENTIAL_FILE
    ? JSON.parse(fs.readFileSync(process.env.ODYSSEY_CREDENTIAL_FILE)).AccessToken : undefined;
  const c = new Controller({}); c.record = { host, ...device, ipPin, token };
  let original;
  try {
    await c.refresh(); original = c.state.current;
    if (!original) throw t.fail('PROTOCOL');
    for (const key of ['displayport', 'usb-c', 'hdmi']) {
      const result = await c.switchSource(key);
      console.log(JSON.stringify({ target: key, ok: result.ok, verification: c.state.verification }));
      if (!result.ok) throw t.fail(result.code);
    }
  } finally {
    if (original) console.log(JSON.stringify({ restored: (await c.switchSource(original)).ok }));
    c.close();
  }
})().catch(error => { console.error('Hardware test failed:', error.code || 'UNKNOWN'); process.exitCode = 1; });
