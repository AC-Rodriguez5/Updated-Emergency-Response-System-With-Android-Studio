# External Monitor Color Fix

Double-click `ExternalMonitorColorFix.exe` to reapply Windows' standard
**sRGB IEC61966-2.1** color profile to the external **IP24V3** monitor.

Safety behavior:

- It identifies this laptop's built-in BOE panel by its hardware ID and excludes
  that display explicitly.
- It only acts when exactly one other monitor is active, so display-number
  changes cannot redirect it to the laptop panel.
- If the target cannot be identified unambiguously, it exits without changing
  anything.

This restores a neutral Windows color-profile baseline. It cannot measure the
panel or replace hardware calibration with a colorimeter. Monitor OSD controls
such as color temperature, gamma, brightness, contrast, HDR, and gaming modes
remain independent of the Windows ICC profile.
