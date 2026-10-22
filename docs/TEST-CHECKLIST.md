# Test checklist (Windows, with Meeting Media Manager running)

Automated tests cannot cover the M³ hand-off, so run this on the real PC after any change to `electron/` or `App.tsx`.

- [ ] App opens; Settings shows the saved display and hide/show shortcut.
- [ ] Start: M³'s media hides, the stage window appears on the chosen display, the timer counts down.
- [ ] Stop mid-count: stage fades out and closes, M³'s media comes back, the app stays open.
- [ ] Let a short timer finish: pulse, fade, M³'s media returns; with "Close after timer ends" on, the app quits.
- [ ] Change the shortcut in Settings, restart the app: the new shortcut is used and remembered.
- [ ] Schedule on with a time 2 minutes ahead: the timer starts by itself once, then not again that minute.
- [ ] Start minimized / launch at startup behave as set.
