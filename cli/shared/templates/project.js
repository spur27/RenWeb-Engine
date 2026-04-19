'use strict';

const { toSnake } = require('../utils');
const { DEFAULT_PERMISSIONS } = require('../constants');


const DEFAULT_TEMPLATE_INFO = {
    title:          'My RenWeb App',
    description:    '',
    author:         '',
    version:        '0.0.1',
    license:        'BSL 1.0',
    categories:     ['Utility'],
    app_id:         'io.github.user.my_renweb_app',
    repository:     '',
    starting_pages: ['main'],
    permissions:    { ...DEFAULT_PERMISSIONS },
    origins:        [],
};



function makeConfigJson(info, pageName) {
    return JSON.stringify({
        __defaults__: {
            title_bar:    true,
            fullscreen:   false,
            keepabove:    false,
            maximize:     false,
            minimize:     false,
            opacity:      1,
            position:     { x: 0, y: 0 },
            resizable:    true,
            size:         { width: 1280, height: 840 },
            taskbar_show: true,
            initially_shown: true,
        },
        [pageName]: { title: info.title, merge_defaults: true },
    }, null, 4);
}

function makeInfoJson(info, pageName) {
    return JSON.stringify({
        title:          info.title,
        description:    info.description,
        author:         info.author,
        version:        info.version,
        license:        info.license,
        categories:     info.categories,
        app_id:         info.app_id,
        repository:     info.repository,
        starting_pages: [pageName],
        permissions:    { ...DEFAULT_PERMISSIONS },
        origins:        [],
    }, null, 4);
}


function makeViteConfig(type, pageName) {
    const plugins = {
        react:  `import react from '@vitejs/plugin-react';\n\nconst plugins = [react()];`,
        vue:    `import vue   from '@vitejs/plugin-vue';\n\nconst plugins = [vue()];`,
        svelte: `import { svelte } from '@sveltejs/vite-plugin-svelte';\n\nconst plugins = [svelte()];`,
        preact: `import preact from '@preact/preset-vite';\n\nconst plugins = [preact()];`,
    }[type] || 'const plugins = [];';

    return `import { defineConfig } from 'vite';
${plugins}

// RenWeb: output into build/content/${pageName}/ so the engine can load it.
// base './' ensures all asset paths are relative (required for file:// loading).
export default defineConfig({
  plugins,
  base: './',
  build: {
    outDir: './build/content/${pageName}',
    emptyOutDir: true,
  },
});
`;
}

module.exports = {
    DEFAULT_TEMPLATE_INFO,
    makeConfigJson,
    makeInfoJson,
    makeViteConfig,
};
