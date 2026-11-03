# Odyssey OLED G8 Controller

A local macOS and Windows app for switching Odyssey OLED G8 between USB-C, DisplayPort and HDMI.

Enter the monitor’s IP address, select **Pair monitor**, and allow access on the monitor. The app reads the actual input every three seconds and verifies each switch. External changes update the app without switching back automatically.

Credentials and connection details are encrypted using macOS Keychain or Windows DPAPI. Self-signed device certificates are pinned when pairing. Use a trusted local network; no cloud account is needed.

**Auto-confirm pairing** uses an authorized remote connection to send one OK when this app’s pairing request remains pending. First remote approval is manual. This is timing-based; it does not inspect or dismiss unrelated monitor dialogs. Disable it in connection settings if preferred.

A three-pane window keeps the animated volume wheel beside input and picture settings. Bright, Night and System appearance include subtle scroll indicators. Signal readings identify Monitor or This Computer, with timestamps and Refresh. Supported writes require read-back; new color and sound-output readings stay read-only. Unsupported capability rows are omitted. [Details](docs/information-and-settings.md).

## Run

Download a ZIP from [Releases](https://github.com/WadeSaysHi/odyssey-oled-g8-controller/releases). Extract it and open the app. Builds are unsigned and not notarized; macOS or Windows may require manual approval. macOS releases target Apple silicon; Windows releases target x64.

Or use Node.js 22.12+:

```sh
npm ci
npm start
```

## Development

```sh
npm test
npm run test:ui
npm run dist
```

Direct switching and verification were tested on hardware. See [validation](docs/validation.md) for platform coverage and limitations, including standby, firmware differences and PS5 CEC. [Design notes](docs/design.md).

Independent project; not affiliated with the monitor manufacturer.
