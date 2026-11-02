# Signal information and settings

Every displayed value identifies **Monitor** or **This Computer**. Monitor details and OS output are queried separately, normally every 15 seconds and on Refresh. Timestamps record the last successful queries; failed or expired data is marked stale and settings are disabled. Input changes invalidate the monitor detail snapshot immediately. Values older than 30 seconds cannot enable controls or contribute current-input timing.

## What the values mean

- **Current Input Resolution / Refresh Rate:** the monitor does not expose a verified live timing query through the tested local APIs. Its static device-resolution field is deliberately unused. Values remain Unknown unless a user associates a local display and connected input. On that input, the app can show the queried OS mode, labeled This Computer with an explicit monitor-timing caveat. Another selected device never inherits this computer's mode.
- **This Computer:** macOS uses `system_profiler SPDisplaysDataType`; Windows uses `QueryDisplayConfig` target mode, with a clearly identified `EnumDisplaySettings` desktop-mode fallback. Display labels are anonymous. The association is stored with the encrypted connection profile and may need to be selected again after topology changes. A query denied in an SSH/noninteractive session shows Unavailable. No display modes are set by the app.
- **Refresh Rate:** the OS-reported mode rate in Hz, not a real-time FPS counter. Variable refresh activity is not inferred from it.
- **VRR / HDR:** Unknown. No independently verified status query is available. `GamePCHDR` is shown only as a picture-mode value, never as proof that HDR is active.
- **Picture Mode / Sound Mode / Volume:** read from `getTVStates` and checked against the current input before and after the detail query.

## Layered settings

Sound exposes volume and mute. Picture exposes backlight API level, contrast and sharpness when their getters return valid values. Each Apply is serialized with other monitor operations, checks the input context, writes once, and requires two new getter readings to match. A command echo alone cannot establish success. Input changes during a setting operation cause an unconfirmed result; the app does not attempt a rollback onto another input.

Ranges are conservative protocol bounds, not hardware measurements: volume 0–100, backlight 0–50, contrast 0–50, sharpness 0–20. Small reversible changes passed hardware read-back tests and were restored. Other values within those bounds have not all been exercised.

Backlight is the raw API field name, not a calibrated luminance reading or a verified mapping to the monitor menu's brightness label. The separate raw brightness field is read-only. Its value does not describe panel luminance. Gamma and HDR tone-mapping getters returned Method not found on the tested firmware and remain unavailable. Mode option lists did not respond, so picture and sound modes remain read-only. No invented options or remote-menu navigation are used.

OS references: [Apple display-mode refresh rate](https://developer.apple.com/documentation/coregraphics/cgdisplaymode/refreshrate), [Windows target display mode](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-displayconfig_target_mode), [Windows current desktop mode](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumdisplaysettingsw).
