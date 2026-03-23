---
title: "Credential Types for Package Signing"
description: "Reference list of signing credential files for the RenWeb packaging tool. Place files in the credentials/ directory using the exact names below."
---

## Credential Files

All files live in `credentials/` and follow the `<scope>.<purpose>.<ext>` naming pattern.
Passphrase files share the key's `<scope>.<purpose>` prefix with a `.pass` extension.
The tool also accepts passphrases via the environment variables listed below.

| File | Passphrase / env fallback | OS | Signs / Enables |
|---|---|---|---|
| `windows.authenticode.pfx` | `windows.authenticode.pass` / `RENWEB_WIN_PFX_PASS` | Windows | NSIS `.exe`, MSI `.msi`, MSIX `.msix` |
| `macos.developer-id-app.p12` | `macos.certs.pass` / `RENWEB_MACOS_CERTS_PASS` | macOS | DMG (`codesign --deep`) |
| `macos.developer-id-installer.p12` | `macos.certs.pass` / `RENWEB_MACOS_CERTS_PASS` | macOS | osxpkg `.pkg` (`productsign`) |
| `macos.app-distribution.p12` | `macos.certs.pass` / `RENWEB_MACOS_CERTS_PASS` | macOS | MAS `.pkg` (`productsign`) |
| `macos.appstoreconnect.json` | — | macOS | Notarization via `notarytool`; App Store upload |
| `linux.gpg.asc` | `linux.gpg.pass` / `RENWEB_GPG_PASS` | Linux | zip/tar.gz detached `.asc` signature |
| `linux.snap.token` | — | Linux | Snap Store publish token |
| `linux.abuild.rsa` | — | Linux | Alpine APK package signing |
| `linux.abuild.rsa.pub` | — | Linux | Alpine APK public verification key |
| `nuget.api.key` | — | Windows | NuGet feed push (`nuget push`) |
| `chocolatey.api.key` | — | Windows | Chocolatey.org push (`choco push`) |

> **Note:** `macos.appstoreconnect.json` must contain `{ "issuer_id": "…", "key_id": "…", "private_key": "…" }`.
> Notarization and App Store upload are not yet automated by the package command — the file is reserved for a future step.

Pass `--no-credentials` to the package command to skip all signing and publish steps.
