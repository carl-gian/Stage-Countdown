# Stage Countdown

A full-screen stage countdown for live meetings. It runs alongside **Meeting Media Manager (M³)**: when the countdown
starts, it hides M³'s media window and shows the timer on the stage display; when it ends (or is stopped), it brings M³'s
media back.

Windows 10/11 x64 only. See `CLAUDE.md` for how it works and `docs/` for releasing and testing.

## For developers

```
npm install
npm run electron:dev   # build + launch (Windows)
npm test
npm run typecheck
npm run lint
npm run build:win      # installer in release/
```
