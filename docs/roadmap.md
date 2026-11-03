# Odyssey Display Control — development roadmap

Planning baseline: 3 November 2026. Current implementation: v0.4.0 — expanded remote, keyboard routing, multiple saved displays and capability profiles.

This document records product direction, research findings, delivered work and outstanding decisions. Menu-bar/tray and rename shipped in v0.3.2. The remaining core implementation was authorized for v0.4.0; optional ideas remain explicitly listed as backlog. No delivery dates are committed.

## Progress review — v0.4.0

The user authorized the remaining core roadmap implementation on 3 November 2026. Source implementation is complete for the remote/keyboard, multiple-display foundation and capability-profile milestones. Package validation results are recorded in [validation](validation.md). Hardware-dependent research and optional backlog are not marked complete.

| Area | Actual progress | Remaining gate |
| --- | --- | --- |
| Single-display IP control and desktop UX | Delivered, preserved | Existing hardware/firmware limitations |
| Menu bar / tray and rename | Delivered in v0.3.2; target selector added | Broader hardware coverage |
| Selected icons | E floating-panel tray and C Appearance sun implemented | Both-platform package checks passed |
| Expanded remote | Open settings and Back/Return implemented; user observed opening then closing the top-level settings menu | Deeper submenu behavior and exact joystick quick menu unverified |
| Keyboard routing | Focused Remote mode: single arrows, Enter, Backspace; Escape stops locally; focus/dialog/target guards | Real OSD effects remain context-dependent |
| Multiple displays | Encrypted catalog, legacy migration, per-device credentials/controllers, Connection/tray selection, naming and safe targeting implemented | Two physical monitors required for hardware acceptance |
| Wider Odyssey support | Recognized input inventory and conservative read-only/tested profiles implemented | Additional Odyssey hardware required; no universal compatibility claim |
| Advanced sound/picture | Supported writes retained; additional values read-only | No verified safe interface/ranges for further writes |
| Power / firmware | Power state read-only; no verified firmware getter | No verified power/wake lifecycle or firmware interface |
| Reliability | Per-device isolation and stale-target regression coverage added | PS5 CEC, cold start, address change and overnight tests outstanding |
| Release maintenance | Direct GitHub packages/checksums and migration recovery documentation | Signing identity unavailable; signing/notarization remain external requirements |

Optional presets, discovery, global shortcuts, startup at login and additional languages remain backlog, not delivered features. They require their own interaction and acceptance criteria. No login item is installed.

## 1. Product direction and scope

Build a focused macOS and Windows desktop controller for compatible Samsung Odyssey displays using their local IP interfaces. Reduce dependence on the physical joystick for everyday input selection, sound adjustment and settings navigation.

Agreed direction:

- Expand useful IP remote features and add computer keyboard navigation.
- Support multiple displays as a future product capability.
- Broaden compatibility beyond the currently tested Odyssey OLED G8, based on hardware evidence and detected capabilities.
- Adopt the product name **Odyssey Display Control**.
- Add Windows system-tray and macOS menu-bar access for quick control.
- Improve installation, upgrades and release reliability as the app matures.

Current boundaries:

- Focus on Odyssey IP control. DDC/CI, broader Samsung product lines and a SmartThings/cloud integration are outside the current development scope.
- Do not promise support for every Odyssey display. A display must expose a compatible network interface; available functions can vary by device, firmware, input and operating mode.
- Existing hardware validation covers Odyssey OLED G8. Other displays require their own evidence.
- Public materials must exclude exact model codes, device identifiers, private network addresses and credentials. Keep the current tested device named only **Odyssey OLED G8**.

## 2. Expanded remote control

### First additions

- Add **Open settings**, using the hardware-tested `KEY_MENU` command.
- Retain directional navigation and ordinary OK/Enter.
- Investigate and test **Back/Return** independently of Exit; use a label matching its observed behavior.
- Preserve direct input selection as the primary way to switch sources.
- Research Home, information display and other useful menu shortcuts individually before exposing them.
- Use a small command allowlist. Menu-opening controls must not silently run sequences that select or change settings.

### Evidence already collected

| Command/action | Observed behavior | Interpretation |
| --- | --- | --- |
| Ordinary `KEY_ENTER` with no menu open | Temporary input-information banner | Does not reproduce the physical joystick quick menu in this tested state |
| Ordinary Enter in this app's pending permission dialog | Can confirm Allow | Context-specific confirmation; not proof of joystick equivalence |
| `KEY_MENU` | Opens the full settings menu | Suitable basis for an Open settings control |
| `KEY_MENU`, then ordinary `KEY_ENTER` | Enters/focuses the Picture menu content | Menu navigation confirmed by user observation and photograph |
| `KEY_PANEL_ENTER` / `KEY_PANEL_MENU` in the tested idle state | No visible change | Does not establish that the commands are universally unsupported or ignored |
| Exit during the recent experiment | User observed Smart Hub | Do not assume Exit means close the current menu or establish a clean desktop baseline |

The full settings menu and the physical joystick's small Home/Settings/Source/Return/Power off menu are distinct. A command that opens the exact joystick quick menu remains unfound. Do not label ordinary Enter as joystick emulation.

### Verification and safeguards

- Distinguish **command sent** from **effect verified**. The app cannot currently query OSD focus or capture the monitor's own overlay.
- Test menu commands one at a time, from a known visible starting state, using user observation where required.
- Avoid service/factory menus, resets, agreement acceptance and blind configuration sequences.
- Test Back/Return and close behavior before designing automatic recovery from menus.
- Keep power-off, standby and wake as separate research items; do not infer wake support from a successful power-state query.

## 3. Computer keyboard navigation

Agreed intention: let users navigate the monitor using their computer keyboard, reducing physical joystick use.

Implemented initial interaction:

- Provide an explicit **Control monitor with keyboard** mode on the Remote page.
- Restrict control to the focused app and active Remote page initially.
- Show a persistent indication of whether keyboard control is active and which monitor receives commands.
- Arrow keys send directional navigation. Enter sends ordinary OK/select.
- Backspace sends Back/Return after its top-level settings-menu behavior was observed on hardware.
- Provide a visible Open settings control and consider a configurable shortcut.
- Reserve a clear local way to leave keyboard-control mode. Do not automatically map Escape to the currently ambiguous Exit command.

Input routing requirements:

- Text fields, selectors, connection dialogs and the volume wheel retain normal keyboard behavior.
- Do not transmit keys while the user is editing a form, the app is unfocused, a dialog is open, or no eligible target is selected.
- Leaving Remote, changing target, losing focus or disconnecting must stop any repeat behavior.
- Start with single presses. Add held-key repetition only after testing device behavior, rate limits and release handling; never repeat Enter, power or pairing confirmation automatically.
- Send commands to one explicitly selected monitor. Group remote-key broadcasting is not part of the initial design.
- Keep global shortcuts as a later optional feature, not an initial requirement.

Acceptance evidence should include normal typing unaffected, correct focus routing, no commands after focus loss, no stuck repetition, and visible target selection on both operating systems.

## 4. Multiple-display support

Implemented as a multiple-display software foundation in v0.4.0. Two physical displays are still needed for hardware acceptance. See [usage and migration](multiple-displays.md).

Required foundation:

- Replace the single connection record with separate encrypted device records.
- Give each display its own credentials, certificate pins, internal identity, address, capabilities, source association and timestamps.
- Provide add, pair, reconnect, rename locally, select and forget actions per display.
- Use user-defined names and anonymous default labels; do not expose private identifiers in public diagnostics or examples.
- Preserve the existing single-display connection through migration; handle partial migration failures without losing credentials.
- Serialize operations for each monitor. Independent monitors may operate concurrently without sharing authentication or command queues.
- A timeout or pairing failure on one monitor must not block every other monitor.
- Bind drafts and keyboard commands to their target display and input. Changing either target invalidates affected drafts.

Computer-output association:

- Associate each local video output with the appropriate network monitor and physical input explicitly.
- Do not guess identity from matching resolution, names or screen order.
- Treat topology changes and disconnected outputs visibly; request reassociation when needed.
- Never show one computer's output mode as the active signal of another selected device.

Later options: an overview of all displays and explicit group sound/picture actions with individual outcomes. These are proposals, not agreed next-release requirements. Real multi-monitor acceptance testing needs more than one physical monitor; simulated tests alone cannot establish hardware support.

## 5. Broader Odyssey compatibility

Build around capabilities rather than a single fixed product profile.

- Separate transport/authentication, device capabilities, verified operations and presentation.
- Probe readable capabilities conservatively before exposing controls. Discovery must not silently pair or change settings.
- Support dynamic input inventories and per-device source identifiers rather than assuming every display has the current three ports.
- Keep ranges, modes, labels and unsupported behavior specific to the detected device/context.
- Distinguish unavailable in the current mode, failed to query, not yet tested and confirmed working. One failure is not a permanent compatibility verdict.
- Recheck capabilities when the input or relevant operating state changes.
- Do not add mode choices merely because another Samsung display accepts them.

Maintain a public compatibility matrix with statuses such as hardware-tested, user-reported, experimental and unavailable in the tested configuration. State the tested functions and limitations. Use privacy-preserving display-family names in public; retain sensitive hardware details only in private research when needed.

## 6. Sound, picture, power and information

Preserve existing supported controls and expand only after verification:

- Volume/mute and existing picture adjustments continue to require fresh read-back and input-context checks.
- Keep newly queried color tone, color level, tint and sound output read-only until writes, valid choices and read-back have been tested.
- Research sound-mode and output selection without inventing available options or treating an empty external-device list as permanent lack of support.
- Investigate an alternate firmware-information query only if a credible interface is found. The tested getter did not provide firmware information; omit an unverified value.
- Keep unsupported HDR/VRR, gamma, tone mapping and uncalibrated raw brightness readings out of the normal UI until a meaningful verified interface exists.
- Preserve the distinction between reported picture-mode names and independent HDR status.

Resolution and refresh rate must continue to come from dynamic queries, identify Monitor or This Computer as the source, preserve association restrictions and timestamps, and never imply real-time FPS. Static device resolution is not verified active input timing.

## 7. Reliability, performance and external changes

- Preserve certificate pinning, identity checks and encrypted OS credential storage.
- Keep two fresh confirmation reads for supported writes and input selection; acknowledgements alone are insufficient.
- Continue rejecting a draft if its input changed before Apply reached the controller, and detect changes during verification.
- Detect external input changes without automatically switching back. Test deliberate PS5 CEC takeover separately from the already-tested second-client simulation.
- Keep the v0.3.1 response improvements: unrelated telemetry does not block Apply, and unchanged readings do not receive renewed timestamps.
- Measure action latency, network timeouts and background-query contention; report representative measurements without promising fixed response times or video-arrival timing.
- Improve reconnect behavior, wake/cold-start handling, address changes and sustained stability with dedicated tests.
- Keep failures and stale data visible, and disable actions whose prerequisites are unverified.
- Consider reusable authorized remote connections only after checking lifecycle, credential changes, reconnect and unexpected-prompt behavior.

Auto-confirm remains limited to this app's pending pairing request through an already authorized remote connection. It is timing-based, does not inspect the OSD, and must not expand into approving arbitrary dialogs or agreements.

## 8. Product name and migration

Agreed product name: **Odyssey Display Control**.

Repository name: `odyssey-display-control`, authorized with the menu-bar update.

Rename work should cover the window/app name, package metadata, icons if appropriate, README, repository description, documentation, release names and distribution links. Keep the README and description concise and describe compatibility accurately.

Preserve existing credentials and preferences. Do not casually change bundle identity, OS credential identity or profile locations as part of a cosmetic rename. Plan, test and document any necessary migration before shipping. The product remains an independent project without an implication of manufacturer endorsement.

## 9. UX improvements and later workflow options

Preserve the established design: native window controls, three panes, the original connection sheet and sourced input panel, persistent sound inspector, animated volume wheel, Bright/Night/System appearance, reduced-motion support and subtle scroll indicators with an always-visible option.

### Tray / menu-bar access

Implemented in v0.3.2; native and hardware validation results are tracked in [validation](validation.md).

- Provide a Windows system-tray icon and a macOS menu-bar item.
- Provides current input, source switching, volume up/down, mute, connection status, refresh, reconnect, Open Window and Quit. Monitor selection follows the separate multiple-display milestone.
- Reuse the same capability checks, operation serialization, input-context protection and result verification as the main window.
- With multiple-display support, clearly identify the target monitor before sending a command.
- Define window-close behavior explicitly: optionally keep running in the tray/menu bar, with a visible preference. Closing a window and quitting the application must remain distinct and understandable.
- Include an explicit Quit action that stops polling, closes connections and removes the tray/menu-bar item.
- Keep startup at login opt-in; do not silently enable it as part of adding tray support.
- Support keyboard access, accessible labels and appropriate icons for bright/night system appearances.
- Test background operation, reconnect, reopen-window behavior and shutdown on both platforms.

Closing the window keeps the app running by default. The Appearance preference can disable this behavior; explicit Quit always exits. Startup at login remains a future opt-in feature, with no login item installed by this update.

### Other workflow options

Potential later additions, not yet agreed for implementation:

- Configurable shortcuts beyond the initial focused keyboard-control mode.
- Local input nicknames/icons, clearly distinguished from changing the monitor's own labels.
- Presets containing only tested controls, with per-display/per-input applicability and individual result verification.
- A privacy-safe diagnostic export showing capability and failure information without addresses, identifiers, credentials or private screenshots.
- Opt-in discovery alongside manual IP configuration, with clear selection before pairing.
- Additional languages and accessibility refinements.

Prioritize a small set of reliable daily actions over an unrestricted key console or a large collection of unverified controls.

## 10. Testing and release requirements

For each milestone:

- Run meaningful controller, protocol, storage and UI regression tests on macOS and Windows.
- Add tests for new failure modes, focus routing, command targeting and credential migrations.
- Exercise supported actions on available hardware, read back where possible, and restore test settings.
- Record OSD observations separately from network transport success.
- Review appearance, keyboard access, focus indicators, reduced motion and high-contrast behavior.
- Validate release packages against the intended source and verify uploaded checksums.
- Scan public files and packaged applications for private metadata and credentials.
- Clearly disclose unverified behavior and the limits of model/firmware coverage.

Current distribution is unsigned. Signed Windows builds, macOS signing/notarization, reliable installation/update behavior and longer testing should precede wider promotion. Do not claim that hosted CI or a simulator replaces physical multi-display testing.

## 11. Release maintenance

Continue direct GitHub releases with checksums, concise notes and explicit compatibility limits. Improve signing, notarization, upgrades and recovery as separate maintenance work.

## 12. Existing solutions and research references

These are comparison and interoperability references, not proof of compatibility with our hardware or permission to copy code/assets. Review applicable licenses before any reuse.

| Project | Relevant direction |
| --- | --- |
| [ColorControl](https://github.com/Maassoft/ColorControl) | Samsung network remote control, device handling and presets |
| [DisplayBuddy](https://displaybuddy.app/docs/getting-started) | Multiple-display UX and Samsung Smart network controls |
| [BetterDisplay](https://betterdisplay.pro/guide/interface-reference/app-menu/device-menu/device-control/) | Capability configuration and display-management UX; its DDC functionality is outside our current scope |
| [Twinkle Tray](https://twinkletray.com/) | Windows quick controls, keyboard shortcuts and multi-monitor workflows; DDC is outside our current scope |
| [Home Assistant Samsung integration](https://www.home-assistant.io/integrations/samsungtv/) | Network commands, connection behavior and documented limitations |
| [Samsung WebSocket client](https://github.com/xchwarze/samsung-tv-ws-api) | Remote protocol and connection-lifecycle research |

Potential product distinction: a focused macOS/Windows Odyssey IP controller with secure local storage, explicit result verification and transparent hardware evidence.

## 13. Proposed implementation order and unresolved decisions

| Phase | Proposed content | Status |
| --- | --- | --- |
| Next functional update | Open settings, tested Back/Return behavior, keyboard-control mode and focus routing | Implemented in v0.4.0; top-level Back/Return observed on hardware |
| Name migration | Odyssey Display Control branding and preserved existing profiles | Implemented in v0.3.2; repository metadata updated |
| Multiple displays | Independent device records, selection, credentials and capability state | Implemented foundation in v0.4.0; two-display hardware acceptance pending |
| Wider Odyssey support | Capability profiles and testing on additional IP-capable displays | Capability/profile foundation implemented; additional hardware compatibility unverified |
| Tray / menu-bar access | Background quick controls, reopen main window and explicit Quit | Implemented in v0.3.2; see validation results |
| Later product work | Presets, discovery and broader automation | Proposed options; not approved scope |
| Release maintenance | Signing, upgrades, recovery and longer testing | Future maintenance work |

The core v0.4.0 implementation covers remote/keyboard control, multiple saved displays, capability profiles and selected icons. Remaining research and external validation gates are listed above. Optional workflow proposals remain backlog; they are not implied by completion of the core implementation.

## v0.4.1 layout refinement

Display selection and Add display now live in Connection. The upper-left identity returns to Odyssey OLED G8 for the tested profile, or the configured display name otherwise. Selecting another display keeps Connection open and resets its fields to that target. No credential or storage migration changed.

The user observed PS5 wake switching the monitor to HDMI, then restored the input with the physical joystick. This confirms monitor CEC takeover in that sequence; the app observation log did not capture it, so end-to-end CEC detection remains unverified.

## v0.5.0 capability presentation and quick controls

Implemented configurable display family, artwork aspect ratio and explicit yes/no/unknown speaker metadata in Connection. Speakerless/unknown sound controls are disabled with a reminder; Appearance can hide sound in the main and quick panels. The menu-bar/tray opens a compact anchored panel with horizontal inputs, a volume wheel, mute and Open/Quit; the redundant refresh/reconnect/message block is removed. Mixed-DPI physical multi-screen validation and additional Odyssey hardware remain outstanding.
