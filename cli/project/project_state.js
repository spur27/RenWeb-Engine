'use strict';
// project_state.js
// Detect and represent the full state of a RenWeb project.
//
// Four dimensions:
//   framework  — vanilla | react | vue | svelte | preact
//   js_engine  — none | node | deno | bun
//   build_tool — none | vite
//   has_renweb — whether the RenWeb engine runtime is present in this project

const fs   = require('fs');
const path = require('path');

// ─── Enum constants ───────────────────────────────────────────────────────────

const Framework = Object.freeze({
    VANILLA: 'vanilla',
    REACT:   'react',
    VUE:     'vue',
    SVELTE:  'svelte',
    PREACT:  'preact',
});

const JsEngine = Object.freeze({
    NONE: 'none',
    NODE: 'node',
    DENO: 'deno',
    BUN:  'bun',
});

const BuildTool = Object.freeze({
    NONE: 'none',
    VITE: 'vite',
});

// ─── ProjectState ─────────────────────────────────────────────────────────────

class ProjectState {
    /**
     * @param {string}      opts.root
     * @param {string}      opts.framework   — Framework.*
     * @param {string}      opts.js_engine   — JsEngine.*
     * @param {string}      opts.build_tool  — BuildTool.*
     * @param {boolean}     opts.has_renweb  — RenWeb engine is installed/integrated
     * @param {object|null} opts.info        — parsed info.json
     * @param {object|null} opts.config      — parsed config.json
     * @param {string|null} opts.config_path — absolute path to the config.json loaded
     */
    constructor({ root, framework, js_engine, build_tool, has_renweb, info, config, config_path }) {
        this.root        = root;
        this.framework   = framework;
        this.js_engine   = js_engine;
        this.build_tool  = build_tool;
        this.has_renweb  = has_renweb;
        this.info        = info;
        this.config      = config;
        this.config_path = config_path;
    }

    isVite()    { return this.build_tool === BuildTool.VITE; }
    isVanilla() { return this.framework  === Framework.VANILLA; }
    /** True only for projects that can run `rw build` via a bundler. */
    canBuild()  { return this.isVite(); }

    /** Return a ContentLayout appropriate for this project state. */
    layout() {
        return require('./content_layout').ContentLayout.from(this);
    }

    /** Return a PackageManagerAdapter appropriate for this project state. */
    pkg_manager() {
        return require('./package_manager').PackageManagerAdapter.from(this);
    }

    // ─── Factory methods ───────────────────────────────────────────────────

    /**
     * Standard detection: requires info.json to be present in the directory
     * hierarchy. Returns null when not inside a RenWeb project.
     * Used by every project-scoped command.
     */
    static detect(cwd) {
        const { findProjectRoot } = require('../commands/shared');
        const root = findProjectRoot(cwd || process.cwd());
        if (!root) return null;
        return ProjectState._build(root);
    }

    /**
     * Lenient detection: always returns a ProjectState, falling back through
     * info.json root → package/deno/bun root → cwd.
     * Used by `rw create` to understand an existing project before adding RenWeb.
     */
    static detect_any(cwd) {
        const start = path.resolve(cwd || process.cwd());

        const { findProjectRoot } = require('../commands/shared');
        const renweb_root = findProjectRoot(start);
        if (renweb_root) return ProjectState._build(renweb_root);

        const generic_root = ProjectState._find_generic_root(start);
        return ProjectState._build(generic_root || start);
    }

    // ─── Internal helpers ──────────────────────────────────────────────────

    /** Walk upward for the nearest directory containing package.json / deno.json / bun.lockb. */
    static _find_generic_root(start) {
        let cur = start;
        while (true) {
            if (
                fs.existsSync(path.join(cur, 'package.json')) ||
                fs.existsSync(path.join(cur, 'deno.json'))    ||
                fs.existsSync(path.join(cur, 'deno.jsonc'))   ||
                fs.existsSync(path.join(cur, 'bun.lockb'))
            ) return cur;
            const parent = path.dirname(cur);
            if (parent === cur) return null;
            cur = parent;
        }
    }

    /** Build a complete ProjectState for a known root directory. */
    static _build(root) {
        // ── info.json ──────────────────────────────────────────────────────
        let info = null;
        for (const p of [path.join(root, 'info.json'), path.join(root, 'build', 'info.json')]) {
            if (fs.existsSync(p)) {
                try { info = JSON.parse(fs.readFileSync(p, 'utf8')); break; } catch (_) {}
            }
        }

        // ── config.json ────────────────────────────────────────────────────
        let config = null, config_path = null;
        for (const p of [path.join(root, 'config.json'), path.join(root, 'build', 'config.json')]) {
            if (fs.existsSync(p)) {
                try { config = JSON.parse(fs.readFileSync(p, 'utf8')); config_path = p; break; } catch (_) {}
            }
        }

        // ── Build tool ─────────────────────────────────────────────────────
        const build_tool = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].some(f =>
            fs.existsSync(path.join(root, f))
        ) ? BuildTool.VITE : BuildTool.NONE;

        // ── package.json ───────────────────────────────────────────────────
        let pkg = null;
        const pkg_path = path.join(root, 'package.json');
        if (fs.existsSync(pkg_path)) {
            try { pkg = JSON.parse(fs.readFileSync(pkg_path, 'utf8')); } catch (_) {}
        }

        // ── Framework (from package.json deps) ────────────────────────────
        let framework = Framework.VANILLA;
        if (pkg) {
            const all_deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            if      (all_deps['react'])   framework = Framework.REACT;
            else if (all_deps['vue'])     framework = Framework.VUE;
            else if (all_deps['svelte'])  framework = Framework.SVELTE;
            else if (all_deps['preact'])  framework = Framework.PREACT;
        }

        // ── JS engine (bun > deno > node > none) ──────────────────────────
        let js_engine = JsEngine.NONE;
        if      (fs.existsSync(path.join(root, 'bun.lockb')))                           js_engine = JsEngine.BUN;
        else if (fs.existsSync(path.join(root, 'deno.json')) ||
                 fs.existsSync(path.join(root, 'deno.jsonc')))                           js_engine = JsEngine.DENO;
        else if (pkg)                                                                     js_engine = JsEngine.NODE;

        // ── RenWeb presence (multi-signal) ────────────────────────────────
        const has_renweb = ProjectState._detect_renweb(root, pkg);

        return new ProjectState({ root, framework, js_engine, build_tool, has_renweb, info, config, config_path });
    }

    /**
     * Multi-signal heuristic: is the RenWeb engine already integrated here?
     * Checks, in order:
     *   1. Engine binary present in build/
     *   2. src/modules/renweb/ directory (vanilla src-first layout)
     *   3. build/content/<page>/modules/renweb/ (Vite layout)
     *   4. 'renweb' listed as a package.json dependency
     *   5. renweb JSR import in deno.json
     */
    static _detect_renweb(root, pkg) {
        // 1. Engine binary in build/
        const build_dir = path.join(root, 'build');
        if (fs.existsSync(build_dir)) {
            try {
                if (fs.readdirSync(build_dir).some(f => /-(linux|macos|windows)-/.test(f)))
                    return true;
            } catch (_) {}
        }

        // 2. Vanilla module directory
        if (fs.existsSync(path.join(root, 'src', 'modules', 'renweb'))) return true;

        // 3. Vite build output module directory
        const content_dir = path.join(root, 'build', 'content');
        if (fs.existsSync(content_dir)) {
            try {
                for (const e of fs.readdirSync(content_dir, { withFileTypes: true })) {
                    if (e.isDirectory() &&
                        fs.existsSync(path.join(content_dir, e.name, 'modules', 'renweb')))
                        return true;
                }
            } catch (_) {}
        }

        // 4. npm dependency
        if (pkg && ((pkg.dependencies || {})['renweb'] || (pkg.devDependencies || {})['renweb']))
            return true;

        // 5. Deno JSR import
        for (const f of ['deno.json', 'deno.jsonc']) {
            const p = path.join(root, f);
            if (fs.existsSync(p)) {
                try {
                    const deno = JSON.parse(fs.readFileSync(p, 'utf8'));
                    if (Object.keys(deno.imports || {}).some(k => k.toLowerCase().includes('renweb')))
                        return true;
                } catch (_) {}
            }
        }

        return false;
    }
}

module.exports = { ProjectState, Framework, JsEngine, BuildTool };
