<!-- Copyright (C) 2025 spur27 | SPDX-License-Identifier: BSL-1.0 | See licenses/LICENSE -->

## RenWeb Engine — Maintenance Reference

This file maps every project-wide string that requires coordinated updates across
multiple files. When any of the values below changes, use the listed locations as
a checklist to ensure nothing is missed.

To find all occurrences of any value quickly:

```sh
grep -r "0.1.0" --include="*.json" --include="*.html" --include="*.md" --include="*.js" \
  --exclude-dir=external --exclude-dir=node_modules .
```

---

## Engine Version

**Current value:** `0.1.0`

The authoritative source is `info.json → "version"`. The makefile reads it at
compile time via `sed` to construct the executable filename. All other locations
must be kept in sync manually.

| File | Location |
|------|----------|
| `info.json` | `"version"` field — **source of truth** |
| `build/info.json` | copy deployed alongside the executable |
| `index.html` | JSON-LD `"softwareVersion"` |
| `wiki/home.html` | JSON-LD `"softwareVersion"` |
| `wiki/template_jsons.js` | template JSON `"version"` field |
| `wiki/cli.html` | example output strings (`renweb-0.1.0-linux-x86_64`) |
| `.github/copilot-instructions.md` | `"Version"` field and example paths |

> `wiki/api.html` contains `"0.1.0"` in a code example comment — update as
> well for accuracy, but it has no functional effect.

---

## CLI Tool Version

**Current value:** `0.1.0`

Versioned independently from the engine. The `package-lock.json` is
auto-updated by `npm install`; do not edit it manually.

| File | Location |
|------|----------|
| `cli/package.json` | `"version"` field |
| `cli/package-lock.json` | auto-updated by npm |

---

## JS API Version

**Current value:** `0.1.0`

Three separate config files must stay in sync. `package-lock.json` at the root
is auto-updated.

| File | Location |
|------|----------|
| `web/api/package.json` | `"version"` field |
| `web/api/jsr.json` | `"version"` field |
| `package-lock.json` (root) | auto-updated by npm |

---

## GitHub Repository URL

**Current value:** `https://github.com/spur27/RenWeb-Engine`

Appears in footers, JSON-LD, package metadata, and code constants. The JS
constants in `package.js`, `web/api/index.js`, and `wiki/script.js` are the
functional references; the rest are documentation links.

| File | Location |
|------|----------|
| `cli/commands/package.js` | `DEFAULT_ENGINE_REPO` constant |
| `web/api/index.js` | `DEFAULT_ENGINE_REPOSITORY` constant |
| `wiki/script.js` | `GITHUB_REPO` constant |
| `index.html` | `GITHUB_REPO` JS constant + JSON-LD `codeRepository` |
| `cli/package.json` | `"repository.url"` field |
| `web/api/package.json` | `"repository.url"` field |
| `wiki/template_jsons.js` | `"repository"` and `"engine_repository"` fields |
| `index.html` + all 7 `wiki/*.html` | `og:image`, `twitter:image`, footer links, JSON-LD |
| `README.md` | hero image link, footer |
| `cli/README.md` | hero image link, footer |
| `web/api/README.md` | hero image link, footer |
| `.github/copilot-instructions.md` | `"Repository"` field |
| `info.json` | `"repository"` field |

---

## GitHub Pages Site URL

**Current value:** `https://spur27.github.io/RenWeb-Engine/`

Appears in canonical tags, OG metadata, sitemap entries, and package homepages.

| File | Location |
|------|----------|
| `sitemap.xml` | all `<loc>` entries (8 URLs) |
| `robots.txt` | `Sitemap:` directive |
| `index.html` | `<link rel="canonical">`, `og:url`, JSON-LD `url` and `downloadUrl` |
| All 7 `wiki/*.html` | `<link rel="canonical">`, `og:url`, JSON-LD `isPartOf.url` |
| `cli/package.json` | `"homepage"` field |
| `web/api/package.json` | `"homepage"` field |
| `README.md` | all badge/button `href` values (lines 19–25) |
| `cli/README.md` | badge/button `href` values |
| `web/api/README.md` | badge/button `href` values |

---

## OG / Twitter Social Image URL

**Current value:** `https://raw.githubusercontent.com/spur27/RenWeb-Engine/main/docs/assets/renweb_no_version.png`

If the image is moved, renamed, or the branch changes, all of these must be updated.

| File | Location |
|------|----------|
| `index.html` | `og:image` and `twitter:image` |
| All 7 `wiki/*.html` | `og:image` and `twitter:image` |
| `README.md` | hero `<img src>` |
| `cli/README.md` | hero `<img src>` |
| `web/api/README.md` | hero `<img src>` |

---

## App ID

**Current value:** `io.github.spur27.renweb-engine`

The CLI packaging commands (`package.js`) read `info.app_id` at runtime, so the
only place to update is `info.json`. The other locations below are documentation only.

| File | Location |
|------|----------|
| `info.json` | `"app_id"` field — **source of truth** |
| `build/info.json` | copy deployed alongside the executable |
| `.github/copilot-instructions.md` | `"App ID"` field |

---

## Timestamps

**Current value:** `2026-04-23`

The sitemap `<lastmod>` dates tell search crawlers when content last changed.
Update them every time you push changes to GitHub Pages.

| File | Location |
|------|----------|
| `sitemap.xml` | all 8 `<lastmod>` entries (`YYYY-MM-DD` format, ISO 8601) |

There is no `datePublished` or `dateModified` in any JSON-LD block at this time.
If those are ever added, list them here.

---

## Copyright Year

**Current value:** `2025`

Appears in file headers and page footers. Update when the calendar year changes
on first meaningful commit of a new year.

| File | Location |
|------|----------|
| All 9 HTML files (`index.html` + `wiki/*.html`) | `<!-- Copyright (C) 2025 … -->` header + `&copy; 2025` footer |
| All project `.js` source files | `// Copyright (C) 2025 spur27` header |
| All project `.cpp` / `.hpp` source files | `// Copyright (C) 2025 spur27` header |
| All project `.sh` scripts | `# Copyright (C) 2025 spur27` header |
| `README.md`, `cli/README.md`, `web/api/README.md` | footer line |
| `info.json` | `"copyright"` field |

To find all copyright headers in one shot:

```sh
grep -r "Copyright (C) 2025" --include="*.cpp" --include="*.hpp" \
  --include="*.html" --include="*.js" --include="*.sh" --include="*.md" \
  --exclude-dir=external --exclude-dir=node_modules -l .
```
