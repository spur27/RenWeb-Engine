'use strict';

const fs   = require('fs');
const path = require('path');

class ContentLayout {
    /**
     * @param {string}      opts.content_root        — primary read/write directory
     * @param {string|null} opts.build_content_root  — secondary sweep dir (src-first only)
     * @param {string}      opts.modules_script_path — value for <script src="..."> in template
     */
    constructor({ content_root, build_content_root, modules_script_path }) {
        this.content_root        = content_root;
        this.build_content_root  = build_content_root || null;
        this.modules_script_path = modules_script_path;
    }

    listPages() {
        const seen = new Set();
        for (const base of [this.content_root, this.build_content_root].filter(Boolean)) {
            if (!fs.existsSync(base)) continue;
            try {
                for (const e of fs.readdirSync(base, { withFileTypes: true }))
                    if (e.isDirectory()) seen.add(e.name);
            } catch (_) {}
        }
        return [...seen].sort();
    }

    pageExists(name) {
        for (const base of [this.content_root, this.build_content_root].filter(Boolean)) {
            if (fs.existsSync(path.join(base, name, 'index.html'))) return true;
        }
        return false;
    }

    scaffoldPage(name, info) {
        const index_path = path.join(this.content_root, name, 'index.html');
        if (fs.existsSync(index_path)) return { created: false, index_path };

        fs.mkdirSync(path.dirname(index_path), { recursive: true });
        const title = info ? `${info.title} \u2014 ${name}` : name;
        fs.writeFileSync(index_path,
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body>
  <h1>${name}</h1>
  <script type="module" src="${this.modules_script_path}"></script>
</body>
</html>
`, 'utf8');
        return { created: true, index_path };
    }

    removePage(name) {
        let removed = false;
        for (const base of [this.content_root, this.build_content_root].filter(Boolean)) {
            const dir = path.join(base, name);
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                removed = true;
            }
        }
        return removed;
    }

    static from(state) {
        const { root, build_tool } = state;

        if (build_tool === 'vite') {
            return new ContentLayout({
                content_root:        path.join(root, 'build', 'content'),
                build_content_root:  null,
                modules_script_path: '../../renweb/index.js',
            });
        }

        // Vanilla: prefer src/content/ if it exists; fall back to build/content/
        const src_content = path.join(root, 'src', 'content');
        if (fs.existsSync(src_content)) {
            return new ContentLayout({
                content_root:        src_content,
                build_content_root:  path.join(root, 'build', 'content'),
                modules_script_path: './modules/renweb/index.js',
            });
        }

        return new ContentLayout({
            content_root:        path.join(root, 'build', 'content'),
            build_content_root:  null,
            modules_script_path: './modules/renweb/index.js',
        });
    }
}

module.exports = { ContentLayout };
