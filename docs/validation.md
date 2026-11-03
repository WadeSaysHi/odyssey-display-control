# Validation

Tested 2026-11-03 on an Odyssey OLED G8 over a local network.

| Check | Result |
| --- | --- |
| Direct USB-C, DisplayPort and HDMI switching | Passed on hardware from macOS and Windows |
| macOS desktop buttons and repeated switching | Passed; two fresh input reads, with independent IP Control agreement |
| Windows-side live switching | Passed; two fresh input reads, original input restored |
| Fresh pairing in the macOS app | Passed; allowed on monitor |
| Pairing confirmation through an already authorized remote | Passed on hardware; one OK completed a pending IP Control pairing |
| Packaged macOS app relaunch and saved connection | Passed; existing credentials migrated securely for local testing |
| Keychain / DPAPI encrypted save and load | Passed in packaged apps; plaintext token absent from stored file |
| Packaged macOS Apple silicon / Windows x64 launch | Passed; UI rendering and live monitor read |
| External-client input change | Detected by polling, without an automatic switch back |
| Controller and storage regression tests | Passed on both operating systems |
| Desktop UI validation and compact layout | Passed on macOS; screenshots reviewed |
| npm dependency audit | No known vulnerabilities at validation time |

Verification means the monitor APIs reported the target, not that video pixels were independently inspected. A command acknowledgement alone never counts as success. IP Control can briefly return an error during a transition; two fresh MobileBFF reads can confirm the input, and the UI explicitly identifies that verification scope. A responding but disagreeing IP Control read prevents confirmation.

Polling runs every three seconds when idle. Detection takes longer during a network timeout or a pending switch. Changes after verification are reflected on later polls; the app does not enforce a permanent input lock.

Not verified: deliberately triggered PS5 CEC takeover, fresh Windows pairing approval, wake from standby, cold startup, a real DHCP address change, Intel macOS, other firmware, cross-network use and extended overnight stability. External-change handling was verified with a separate network client, not a controlled PS5 CEC experiment. IP changes require entering the new address; credentials are reused only after identity and certificate checks.

Auto-confirm is limited to a pairing request initiated by this app, after a remote connection has been authorized. It sends at most one Enter after two seconds, cancels that timer when the request completes, and closes the remote connection afterward. The monitor does not expose a readable permission-dialog state; this is a timing-based convenience, not visual detection. A delayed or missing dialog could let Enter act on the current monitor UI. Disable the setting if that tradeoff is unsuitable. The app never watches for arbitrary prompts or auto-approves requests from other clients. Initial remote approval and OS security prompts remain manual.

Builds are unsigned and not notarized. Gatekeeper or SmartScreen may require approval, and unsigned macOS updates may prompt for Keychain access again. Credentials stay in the OS-protected local profile; raw research, network addresses and device metadata are not included in this repository or release bundles.

Development uses Anthropic’s frontend-design skill. See [design](design.md). The local protocol was informed by the [MobileBFF reference](https://github.com/TheFab21/ha-samsungtv-smart/blob/master/custom_components/samsungtv_smart/api/mobilebff.py); implementation is independent and exposes a small allowlist of input, picture, sound and remote controls.

## Version 0.2

The signal section and layered settings were tested with live monitor reads. macOS dynamically reported its current resolution and refresh rate. Windows QueryDisplayConfig returned its current target mode in the signed-in desktop session; SSH-session queries were unavailable and were not substituted with static information. Source-association isolation was tested by switching inputs: computer mode data appeared only on the associated input. GamePCHDR remained a picture mode while HDR and VRR stayed Unknown.

Volume, mute, backlight, contrast and sharpness passed small reversible write/read-back tests on hardware and were restored. The volume form also passed an actual desktop UI write/restore test. Failed-query retention, expiration, input-context changes during writes, and refusal to accept command echoes are covered by regression tests. Gamma and HDR tone-mapping methods returned -32601. Full control ranges, panel-luminance calibration, and a controlled PS5 CEC experiment remain unverified. See [signal/settings semantics](information-and-settings.md).

## Version 0.3

The three-pane UI, volume-wheel keyboard/drag/click behavior, retained drafts, input-change reset, stale-data disabling, Bright/Night/System persistence, overlay-scrollbar dragging and keyboard access, reduced motion and forced-colors fallback pass automated UI tests on macOS and the Windows packaged app. Thirty controller, telemetry, storage and preference tests pass on both platforms.

Live macOS tests passed volume-wheel and mute changes, a contrast-slider change, read-back and restoration; all three direct inputs; second-client switching without automatic reversal; and an authorized Remote Exit command. Newly queried color tone, color level, tint, speaker output and power state are read-only. Remote command transport success does not prove a menu changed. The expected input is carried with each UI setting write; an external input change before Apply reaches the controller rejects that draft.

The packaged Windows app was also launched in the signed-in interactive desktop: DPAPI encryption, storage round-trip, UI rendering, live monitor input read, OS output query and the signal panel passed. This does not replace the still-unverified Windows first-pairing and deliberate PS5 CEC tests. Bright/night screenshots were reviewed; release bundles and public files were checked for private metadata.

## Version 0.3.1 response time

Apply no longer waits for unrelated picture and OS telemetry after two successful getter/context verification pairs. Only the verified setting is updated immediately; other readings retain their original timestamps and refresh on the next idle poll. Source verification samples every 250 ms rather than waiting one second before each sample; two fresh agreeing samples remain required.

On the same local hardware, one before/after measurement reduced unchanged-volume confirmation from 4.77 s to 2.23 s, and current-input confirmation from 3.17 s to 1.61 s. A repeat measured 2.42 s and 1.68 s. Actual DisplayPort, HDMI and USB-C transitions were confirmed in 3.58 s, 5.32 s and 3.42 s respectively. These are small-sample API timings, not guarantees or measurements of visible video arrival. Existing polling/network delays remain possible.

## Version 0.3.2 menu-bar/tray and rename

Native macOS menu-bar and Windows system-tray controls provide source selection, volume steps, mute, refresh/reconnect, Open Window and Quit. Closing the window keeps polling active by default; Appearance can disable hide-on-close. No login item is installed. Native popup dismissal/reopening, hide/reopen, preference changes and explicit Quit are covered by `scripts/tray-test.cjs`. The popup lifecycle test found and fixed a menu that could otherwise remain marked open after dismissal. Thirty-four unit tests and the existing UI checks pass on both platforms. Windows native lifecycle checks also pass in the signed-in interactive desktop.

On macOS, packaged native-menu callbacks passed live volume/mute write, read-back and restoration, current-source verification, and polling while hidden. The renamed package decrypted the existing encrypted profile and reconnected without pairing; encrypted bytes, full connection record (including saved association), profile directory and preference bytes matched the old package. The encryption provider is initialized using the legacy name before applying the new display name. Bundle ID, executable name, profile location and remote authorization name remain stable. Windows encryption created by the prior package was decrypted successfully by the renamed package.

The product and repository are now Odyssey Display Control / `odyssey-display-control`. This rename does not establish compatibility with additional hardware. Multi-display support and keyboard remote navigation remain future roadmap work. Existing firmware, power/wake, deliberate PS5 CEC and long-term stability limitations remain. Unsigned builds may still trigger OS approval or Keychain prompts.
