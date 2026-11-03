# Compatibility

| Display / configuration | Evidence | Limits |
| --- | --- | --- |
| Odyssey OLED G8 | Hardware-tested from macOS Apple silicon and Windows x64: direct USB-C/DisplayPort/HDMI switching, queried state and supported settings | Full ranges, other firmware, standby/wake, cold start, deliberate PS5 CEC and overnight stability remain unverified |
| Odyssey OLED G8 remote settings | User observed Open settings then Back/Return closing the top-level menu | Deeper submenu behavior and exact joystick quick-menu command remain unverified |
| Additional IP-capable Odyssey displays | Reported-input handling tested with simulated inventories; no additional physical display tested | Must expose compatible local APIs; new setting writes disabled by default |
| Multiple physical displays | Independent encrypted records, queues, drafts and targeting implemented; simulated isolation tests | Two-monitor hardware acceptance remains outstanding |

The app queries reported input inventories and readable settings. It does not claim support for all Odyssey displays. Unsupported or failed queries remain unavailable; static resolution and picture-mode names do not establish live timing or HDR. DDC/CI and cloud control are outside scope. Firmware information has no verified getter; power-state reading does not establish safe power-off or wake control.

Input handling is tested in software with one, four, seven and 24-port inventories, opaque IDs, alternate HDMI/DP spellings, reordered/duplicate/disappearing entries, empty lists and bounded malformed-data fuzzing. Unknown types are preserved as anonymous inputs. This removes the fixed three-port assumption; it does not prove that every Odyssey implements the same network API. Additional hardware testing is not a prerequisite for this software release.
