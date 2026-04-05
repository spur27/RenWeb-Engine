'use strict';
// cli/shared/index.js
// Barrel re-export for all shared CLI modules.
// Import from here when you need items from multiple sub-modules, or import
// the sub-modules directly for clarity.

const constants        = require('./constants');
const utils            = require('./utils');
const fetchers         = require('./fetchers');
const projectTemplates = require('./templates/project');
const pluginTemplates  = require('./templates/plugin');

module.exports = {
    ...constants,
    ...utils,
    ...fetchers,
    ...projectTemplates,
    ...pluginTemplates,
};
