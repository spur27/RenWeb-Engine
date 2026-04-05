'use strict';

/** Framework types that use Vite under the hood and always require node. */
const FRAMEWORK_TYPES = ['react', 'vue', 'svelte', 'preact', 'solid', 'lit'];

/** Framework types that use their own dedicated CLI (not Vite). */
const ANGULAR_TYPES = ['angular'];

/**
 * Per-framework Vite metadata:
 *   template   — slug passed to create-vite@5
 *   pluginPkg  — npm package containing the Vite plugin (null if not needed)
 *   importLine — JS import statement for the plugin (null for lit)
 *   pluginCall — expression used inside plugins:[…] (null for lit)
 */
const VITE_FRAMEWORK = {
    react: {
        template:   'react',
        pluginPkg:  '@vitejs/plugin-react',
        importLine: "import react from '@vitejs/plugin-react';",
        pluginCall: 'react()',
    },
    vue: {
        template:   'vue',
        pluginPkg:  '@vitejs/plugin-vue',
        importLine: "import vue from '@vitejs/plugin-vue';",
        pluginCall: 'vue()',
    },
    svelte: {
        template:   'svelte',
        pluginPkg:  '@sveltejs/vite-plugin-svelte',
        importLine: "import { svelte } from '@sveltejs/vite-plugin-svelte';",
        pluginCall: 'svelte()',
    },
    preact: {
        template:   'preact',
        pluginPkg:  '@preact/preset-vite',
        importLine: "import preact from '@preact/preset-vite';",
        pluginCall: 'preact()',
    },
    solid: {
        template:   'solid',
        pluginPkg:  'vite-plugin-solid',
        importLine: "import solid from 'vite-plugin-solid';",
        pluginCall: 'solid()',
    },
    lit: {
        template:   'lit',
        pluginPkg:  null,
        importLine: null,
        pluginCall: null,
    },
};

/** All types accepted by `rw create`. */
const ALL_TYPES = ['vanilla', ...FRAMEWORK_TYPES, ...ANGULAR_TYPES, 'plugin', 'engine'];

/** RenWeb JS/TS API files downloadable from the engine repo raw tree. */
const API_FILES = ['index.js', 'index.js.map', 'index.d.ts', 'index.ts'];

/**
 * Default permission values written into info.json for new projects.
 * Kept here so that all template generators and scaffolders stay in sync.
 */
const DEFAULT_PERMISSIONS = {
    geolocation:                  false,
    notifications:                true,
    media_devices:                false,
    pointer_lock:                 false,
    install_missing_media_plugins: true,
    device_info:                  true,
};

module.exports = {
    FRAMEWORK_TYPES,
    ANGULAR_TYPES,
    VITE_FRAMEWORK,
    ALL_TYPES,
    API_FILES,
    DEFAULT_PERMISSIONS,
};
