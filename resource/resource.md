# Custom Branding Assets

This folder contains all developer-supplied branding files used by the
`renweb package` CLI command when building installers. Drop the files listed
below into this directory and run the packager — each one is picked up
automatically if present; nothing breaks if it is absent.

**Custom branding** means replacing the plain, tool-default installer visuals
(white backgrounds, no imagery, generic window titles) with your own product
identity: your application icon in the title bar, your logo or artwork in the
welcome screen sidebar, and your background image behind the drag-to-install
layout. The result is an installer that looks and feels like *your* product
rather than a raw OS or build-tool default.

---

## Icons (required per platform)

| File | Platform | Notes |
|------|----------|-------|
| `app.icns` | macOS | Multi-resolution icon bundle. Copied verbatim into `Contents/Resources/AppIcon.icns` inside the `.app`. Create with `iconutil` from a 1024×1024 source. |
| `app.ico` | Windows | Multi-resolution ICO. Used as the installer window icon and the `.exe` file icon. Create with ImageMagick or an ICO editor from sizes 16, 32, 48, 64, 128, 256. |
| `app.png` | Linux / AppImage | Square PNG, minimum 128×128. Used as the AppImage desktop entry icon. A 256×256 or 512×512 source is recommended. |

---

## Backgrounds (optional per platform)

Each background file is looked up under the below filenames:

| Filename | Dimensions |
|-----------------|-----------------|
| `bk_dmg.png` | 600×400 px |
| `bk_pkg.png` | 568×323 px |
| `bk_setup-exe.png` | 164x314 px |
| `bk_msi.png` | 493x312 px |

You can also use hyphens instead of underscores. The underscore variant is checked first; if absent, the hyphen variant is tried.
If neither exists the installer falls back to its default visuals.
