# Releasing a new version

Installed copies check GitHub Releases at every start (8 s after launch) and every 6 h. A new version downloads in the background; the
operator sees a blue "Update ready" badge (app + OBS dock), a Windows notification and a tray item, and installs it when ready (or it
installs on the next quit). It never restarts by itself.

0. Write `docs/RELEASE-NOTES-X.Y.Z.md` (the workflow pastes it into the Release page).
1. Add an entry for the new version at the top of `src/lib/changelog.ts` (plain language, for the operator). It is shown once after the update. A test fails if it is missing.
2. Change `"version"` in `package.json` (e.g. `1.0.0` -> `1.1.0`). It must be higher than the installed one.
3. Run `npm test`, `npm run typecheck`, `npm run lint`.
4. Commit and push to `main`.
5. Tag and push the tag:
   ```
   git tag v1.1.0
   git push origin v1.1.0
   ```
6. GitHub Actions ("Release Windows installer") builds and publishes `StageCountdown-Setup-<version>.exe` plus `latest.yml` to a Release.
   **`latest.yml` is what installed copies read to find updates**: don't delete it from the release.

Notes
- The repo must be **public** (or releases hosted elsewhere) or installed apps cannot download updates.
- **If the repo is renamed or moved**, change `build.publish.owner` / `build.publish.repo` in `package.json` BEFORE building the release, or installed copies will look in the wrong place. Copies that were built pointing at the old address keep looking there, so keep the old repo's releases up (GitHub redirects renamed repos).
- The first release must be installed by hand; later versions update themselves.
- The **portable** `.exe` (test builds only) cannot update itself; only the installer version can.
- Unsigned builds work but Windows SmartScreen may warn; code signing is a separate decision.
- Test before a live meeting: see `docs/TEST-CHECKLIST.md`.

## Getting a test build (no release needed)

Every push to any branch runs **Build Windows test build**. When it finishes (about 3-5 min, green tick):
1. GitHub -> **Actions** tab -> click the run (or the branch's latest run).
2. Scroll to **Artifacts** at the bottom.
3. Download **StageCountdown-Portable** (a zip with one `.exe`: unzip and double-click, nothing is installed) or
   **StageCountdown-Installer** (to test installing / Start at login / auto-update).
4. Windows may show a blue SmartScreen warning because the app is unsigned: **More info -> Run anyway**.

Artifacts are kept 14 days. You can also run it by hand: Actions -> Build Windows test build -> **Run workflow**.

To test the update flow end to end, install an older release, publish a newer tag, and wait for the badge (or Settings > About & updates > Check for updates).
