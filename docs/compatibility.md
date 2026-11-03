# Compatibility

| Display / configuration | Evidence | Limits |
| --- | --- | --- |
| Odyssey OLED G8 | Hardware-tested from macOS Apple silicon and Windows x64: direct USB-C/DisplayPort/HDMI switching, queried state and supported settings | Full ranges, other firmware, standby/wake, cold start, deliberate PS5 CEC and overnight stability remain unverified |
| Odyssey OLED G8 remote settings | User observed Open settings then Back/Return closing the top-level menu | Deeper submenu behavior and exact joystick quick-menu command remain unverified |
| Additional IP-capable Odyssey displays | Experimental capability foundation only; no additional physical display tested | Must expose compatible local APIs; new setting writes disabled by default |
| Multiple physical displays | Independent encrypted records, queues, drafts and targeting implemented; simulated isolation tests | Two-monitor hardware acceptance remains outstanding |

The app queries recognized input inventories and readable settings. It does not claim support for all Odyssey displays. Unsupported or failed queries remain unavailable; static resolution and picture-mode names do not establish live timing or HDR. DDC/CI and cloud control are outside scope. Firmware information has no verified getter; power-state reading does not establish safe power-off or wake control.
