# Releasing a new version

1. Make your changes on a branch; run `npm test` and `npm run typecheck`.
2. Change `"version"` in `package.json` (e.g. `1.0.0` -> `1.1.0`).
3. Merge to `main` (the **Build Windows installer** workflow runs and uploads the `.exe` as an artifact: Actions tab -> the run -> Artifacts).
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
