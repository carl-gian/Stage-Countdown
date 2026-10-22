# Releasing a new version

1. Make your changes on a branch; run `npm test` and `npm run typecheck`.
2. Change `"version"` in `package.json` (e.g. `1.0.0` -> `1.1.0`).
3. Merge to `main`. (Every push to any branch already builds a test copy, see below.)
4. Tag and push the tag:
   ```
   git tag v1.1.0
   git push origin v1.1.0
   ```
5. The **Release Windows installer** workflow publishes `StageCountdown-Setup-<version>.exe` to GitHub Releases.

Notes
- Unsigned builds work, but Windows SmartScreen may warn.
- Installed copies do **not** self-update yet (no `electron-updater` in the app). Install the new `.exe` over the old one.
- Test before a live meeting: see `docs/TEST-CHECKLIST.md`.

## Getting a test build (no release needed)

Every push to any branch runs **Build Windows test build**. When it finishes (about 3-5 min, green tick):
1. GitHub -> **Actions** tab -> click the run (or the branch's latest run).
2. Scroll to **Artifacts** at the bottom.
3. Download **StageCountdown-Portable** (a zip with one `.exe`: unzip and double-click, nothing is installed) or
   **StageCountdown-Installer** (to test installing / Start at login).
4. Windows may show a blue SmartScreen warning because the app is unsigned: **More info -> Run anyway**.

Artifacts are kept 14 days. You can also run it by hand: Actions -> Build Windows test build -> **Run workflow**.
