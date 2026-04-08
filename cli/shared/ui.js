'use strict';

const chalk = require('chalk');

// ── Palette ───────────────────────────────────────────────────────────────────
const PURPLE   = '#8b5cf6';
const MAGENTA   = '#d946ef';
const CYAN     = '#22d3ee';
const GREEN    = '#10b981';
const AMBER    = '#f59e0b';
const RED      = '#ef4444';
const DIM      = '#aaaaaa';
const WHITE    = '#e0e0e0';
const SPECTRUM = [
    '#ff0000', '#ff7700', '#ffdd00', '#00ff00',
    '#00ffff', '#0088ff', '#8800ff', '#ff00ff',
];

// ── Rainbow ───────────────────────────────────────────────────────────────────
const rainbow = (str) => {
    let ci = 0;
    return str.split('').map((c) => {
        if (/\s/.test(c)) return c;
        return chalk.hex(SPECTRUM[ci++ % SPECTRUM.length])(c);
    }).join('');
};

// ── Status lines ──────────────────────────────────────────────────────────────
const step  = (msg) => console.log(chalk.hex(PURPLE)('  › ') + chalk.hex(WHITE)(msg));

const ok    = (msg) => console.log(chalk.hex(GREEN)('  ✓ ')  + chalk.hex(WHITE)(msg));

const warn  = (msg) => console.log(chalk.hex(AMBER)('  ⚠︎ ')  + chalk.hex(WHITE)(msg));

const error = (msg) => console.log(chalk.hex(RED)('  ✗ ')   + chalk.hex(WHITE)(msg));

const info  = (msg) => console.log(chalk.hex(PURPLE)('  · ') + chalk.hex(WHITE)(msg));

const dim   = (msg) => console.log(chalk.hex(DIM)('    ' + msg));

const spacer = () => console.log('');

// ── Menu helpers ──────────────────────────────────────────────────────────────
const menuGroup = (label) => console.log(chalk.bold.hex(PURPLE)(`  ${label}`));

const menuItem  = (name, desc) => console.log(
    `    ${chalk.hex(MAGENTA)(name.padEnd(10))}${chalk.hex(DIM)(desc)}`
);

const plain = (msg) => console.log(chalk.hex(DIM)(msg));

// ── Section dividers ──────────────────────────────────────────────────────────
const section = (label) => {
    const cols = process.stdout.columns || parseInt(process.env.COLUMNS, 10) || 80;
    const fill = '─'.repeat(Math.max(0, cols - label.length - 5));
    console.log('\n' + chalk.bold.hex(PURPLE)(`── ${label} ${fill}`));
};

// ── Box header ────────────────────────────────────────────────────────────────
const header = (label) => {
    const pad    = ' '.repeat(5);
    const border = '─'.repeat(label.length + pad.length * 2);
    console.log('');
    console.log(chalk.hex(PURPLE)(`  ┌${border}┐`));
    console.log(chalk.hex(PURPLE)('  │') + pad + chalk.bold.hex(WHITE)(label) + pad + chalk.hex(PURPLE)('│'));
    console.log(chalk.hex(PURPLE)(`  └${border}┘`));
    console.log('');
};

// ── Next steps list ───────────────────────────────────────────────────────────
const nextSteps = (steps) => {
    console.log('\n' + chalk.bold.hex(PURPLE)('Next steps:'));
    for (const [cmd, hint] of steps) {
        const cmd_text  = chalk.hex(WHITE)(cmd);
        const hint_text = hint ? chalk.hex(DIM)('  # ' + hint) : '';
        console.log(chalk.hex(PURPLE)('  › ') + cmd_text + hint_text);
    }
    console.log('');
};

// ── Banner ────────────────────────────────────────────────────────────────────

const renwebBanner = (version) => {
    const label  = 'R e n W e b  E n g i n e  C L I';
    const pad    = ' '.repeat(5);
    const border = '─'.repeat(label.length + pad.length * 2);
    console.log('');
    console.log(chalk.hex(PURPLE)(`  ┌${border}┐`));
    console.log(chalk.hex(PURPLE)('  │') + pad + rainbow(label) + pad + chalk.hex(PURPLE)('│'));
    console.log(chalk.hex(PURPLE)(`  └${border}┘`));
    console.log(
        chalk.hex(DIM)(`  v${version}`) +
        '  ' + chalk.hex(CYAN)('https://github.com/spur27/RenWeb-Engine')
    );
    console.log('');
};
// ── Colored prompt wrapper ───────────────────────────────────────────────────
/**
 * Colored drop-in replacement for utils.prompt().
 * Renders the question in purple and the fallback hint in dim before
 * delegating to rl.question so readline still handles the cursor correctly.
 */
const prompt = (rl, question, fallback = '') => new Promise(resolve => {
    const label    = chalk.bold.hex(PURPLE)(question);
    const hint     = fallback ? chalk.hex(DIM)(` [${fallback}]`) : '';
    const colon    = chalk.hex(PURPLE)(':') + ' ';
    rl.question(label + hint + colon, ans => resolve(ans.trim() || fallback));
});
// ── Help formatter helpers ───────────────────────────────────────────────────
const helpTitle = (str) => chalk.bold.hex(PURPLE)(str);
const helpCmd   = (str) => chalk.bold.hex(WHITE)(str);
const helpDesc  = (str) => chalk.hex(DIM)(str);
const helpOpt   = (str) => chalk.hex(MAGENTA)(str);
const helpArg   = (str) => chalk.hex(CYAN)(str);

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
    // palette
    PURPLE, MAGENTA, CYAN, GREEN, AMBER, RED, DIM, WHITE, SPECTRUM,
    // functions
    rainbow, step, ok, warn, error, info, dim, spacer,
    menuGroup, menuItem, plain,
    section, header, nextSteps, renwebBanner,
    helpTitle, helpCmd, helpDesc, helpOpt, helpArg,
    prompt,
};
