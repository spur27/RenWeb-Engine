// Comprehensive build system for multiple UI frameworks and asset types
import webpack from 'webpack';
import TerserWebpackPlugin from 'terser-webpack-plugin';
import { readdirSync, lstatSync, cpSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import Path from 'path';
import { LogLevel, Logger } from '../lib/logger.ts';
import Chalk from 'chalk';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { execSync, spawn } from 'child_process';
import HtmlBundlerWebpackPlugin from 'html-bundler-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { emptyDirSync } from 'fs-extra';

const logger = new Logger("ComprehensiveBuilder", false, LogLevel.TRACE, Chalk.bold.magenta);

const throwCriticalError = (msg: any) => {
    logger.critical(msg);
    throw new Error(msg);
}

// Comprehensive asset MIME types and extensions based on https://mimetype.io/all-types
const ASSET_EXTENSIONS = {
    // Images - Complete image format support
    images: [
        '.png', '.jpg', '.jpeg', '.jpe', '.pjpg', '.jfif', '.jfif-tbnl', '.jif', '.gif', '.svg', '.svgz',
        '.webp', '.avif', '.avifs', '.ico', '.bmp', '.tiff', '.tif', '.tga', '.dds', '.ief', '.cgm', '.g3',
        '.heif', '.heic', '.btif', '.psd', '.djv', '.djvu', '.dwg', '.dxf', '.fbs', '.fpx', '.fst',
        '.mmr', '.rlc', '.mdi', '.npx', '.wbmp', '.xif', '.dng', '.cr2', '.crw', '.ras', '.cmx',
        '.erf', '.fh', '.fh4', '.fh5', '.fh7', '.fhc', '.raf', '.icns', '.dcr', '.k25', '.kdc',
        '.mrw', '.nef', '.orf', '.raw', '.rw2', '.rwl', '.pcx', '.pef', '.ptx', '.pct', '.pic',
        '.pnm', '.pbm', '.pgm', '.ppm', '.rgb', '.x3f', '.arw', '.sr2', '.srf', '.xbm', '.xpm', '.xwd'
    ],
    
    // Fonts - Complete font format support
    fonts: [
        '.woff', '.woff2', '.eot', '.ttf', '.ttc', '.otf', '.fon', '.fnt', '.afm', '.pfa', '.pfb', '.pfm',
        '.bdf', '.gsf', '.psf', '.pcf', '.snf'
    ],
    
    // Audio - Complete audio format support
    audio: [
        '.mp3', '.mpga', '.m2a', '.m3a', '.mp2', '.mp2a', '.wav', '.aac', '.m4a', '.m4b', '.m4p', '.m4r',
        '.flac', '.ogg', '.oga', '.spx', '.opus', '.wma', '.wax', '.ra', '.ram', '.rmp', '.au', '.snd',
        '.aiff', '.aif', '.aff', '.kar', '.mid', '.midi', '.rmi', '.eol', '.dts', '.dtshd', '.lvp',
        '.pya', '.ecelp4800', '.ecelp7470', '.ecelp9600', '.weba', '.mka', '.m3u', '.3g2', '.aacp', '.adp'
    ],
    
    // Video - Complete video format support
    video: [
        '.mp4', '.mp4v', '.mpg4', '.m4v', '.mpeg', '.mpg', '.mpe', '.m1v', '.m2v', '.mpa', '.webm',
        '.ogv', '.avi', '.mov', '.qt', '.mkv', '.wmv', '.wmx', '.wvx', '.wm', '.asf', '.asx', '.flv',
        '.f4v', '.fli', '.movie', '.3gp', '.3g2', '.3ga', '.3gpa', '.3gpp', '.3gpp2', '.3gp2',
        '.h261', '.h263', '.h264', '.jpgv', '.jpgm', '.jpm', '.mj2', '.mjp2', '.ts', '.fvt',
        '.m4u', '.mxu', '.pyv', '.viv'
    ],
    
    // Documents - Complete document format support
    documents: [
        '.pdf', '.doc', '.dot', '.wiz', '.docx', '.docm', '.dotx', '.dotm', '.rtf', '.txt', '.text',
        '.md', '.markdown', '.mdown', '.markdn', '.odt', '.ott', '.oth', '.odm', '.otm', '.ods', '.ots',
        '.odp', '.otp', '.odg', '.otg', '.odc', '.otc', '.odi', '.oti', '.odf', '.odft', '.odb',
        '.xls', '.xlt', '.xlw', '.xla', '.xlb', '.xlc', '.xlm', '.xlsx', '.xlsm', '.xltx', '.xltm', '.xlam', '.xlsb',
        '.ppt', '.pot', '.pps', '.ppa', '.pwz', '.pptx', '.pptm', '.potx', '.potm', '.ppsx', '.ppsm', '.ppam', '.sldx', '.sldm',
        '.mpp', '.mpt', '.rtx', '.wpd', '.wps', '.wcm', '.wdb', '.wks', '.lwp', '.123', '.apr', '.pre', '.nsf', '.org', '.scm'
    ],
    
    // Data - Complete data format support
    data: [
        '.json', '.xml', '.xsl', '.xpdl', '.yaml', '.yml', '.csv', '.tsv', '.toml', '.atom', '.rss',
        '.rdf', '.mathml', '.mml', '.xhtml', '.xht', '.dtd', '.xenc', '.xop', '.xslt', '.xspf',
        '.mxml', '.xhvml', '.xvm', '.xvml', '.wsdl', '.wspolicy', '.pls', '.rq', '.srx', '.vxml'
    ],
    
    // Archives - Complete archive format support
    archives: [
        '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz', '.bz2', '.boz', '.ace', '.cpio', '.gtar',
        '.ustar', '.shar', '.sit', '.sitx', '.lha', '.lzh', '.dms', '.pkg', '.dmg', '.msi', '.deb', '.udeb',
        '.rpm', '.rpa', '.cab', '.ear', '.jar', '.war'
    ],
    
    // 3D Models - Complete 3D model format support
    models: [
        '.obj', '.fbx', '.gltf', '.glb', '.dae', '.3ds', '.iges', '.igs', '.mesh', '.msh', '.silo',
        '.dwf', '.gdl', '.gtw', '.mts', '.vtu', '.vrml', '.wrl', '.x3d', '.ply', '.stl'
    ],
    
    // Office and productivity
    office: [
        '.sdc', '.sda', '.sdd', '.smf', '.sdw', '.vor', '.sgl', '.sxc', '.stc', '.sxd', '.std',
        '.sxi', '.sti', '.sxm', '.sxw', '.sxg', '.stw', '.oxt', '.vsd', '.vss', '.vst', '.vsw',
        '.vsdx', '.vssx', '.vstx', '.vssm', '.vstm', '.pub', '.mdb', '.accdb'
    ],
    
    // eBook formats
    ebooks: [
        '.epub', '.mobi', '.prc', '.azw', '.lit', '.lrf', '.fb2', '.tcr', '.pdb', '.pml', '.rb', '.snb'
    ],
    
    // CAD and engineering
    cad: [
        '.dwg', '.dxf', '.dgn', '.step', '.stp', '.iges', '.igs', '.sat', '.catpart', '.catproduct',
        '.prt', '.asm', '.ipt', '.iam', '.nx', '.unv', '.jt'
    ],
    
    // Chemical and scientific
    chemical: [
        '.cdx', '.cif', '.cmdf', '.cml', '.csml', '.xyz', '.mol', '.sdf', '.pdb'
    ],
    
    // Configuration and system files
    config: [
        '.conf', '.config', '.ini', '.cfg', '.properties', '.env', '.editorconfig', '.gitignore',
        '.htaccess', '.htpasswd', '.htgroups', '.log', '.diff', '.patch'
    ],
    
    // Development and source code (excludes JS/TS files that should be compiled)
    source: [
        '.vue', '.svelte', '.php', '.py', '.pyc', '.pyo', '.pyd', '.whl',
        '.rb', '.java', '.class', '.jar', '.c', '.cpp', '.cxx', '.cc', '.h', '.hh', '.hpp', '.cs',
        '.vb', '.vbs', '.pl', '.pm', '.r', '.m', '.swift', '.go', '.rs', '.kt', '.scala', '.clj',
        '.hs', '.elm', '.dart', '.coffee', '.ls', '.ps1', '.psm1', '.sh', '.bash', '.zsh', '.fish',
        '.asm', '.s', '.f', '.f77', '.f90', '.for', '.p', '.pas', '.pp', '.inc', '.sql', '.gql'
    ],
    
    // Compiled source files (handled separately by webpack loaders, not asset rules)
    compiled_source: [
        '.js', '.ts', '.jsx', '.tsx', '.mjs'
    ],
    
    // Web and markup
    web: [
        '.html', '.htm', '.xhtml', '.xht', '.xml', '.css', '.scss', '.sass', '.less', '.styl', '.stylus',
        '.hbs', '.handlebars', '.pug', '.jade', '.ejs', '.njk', '.nunjucks', '.mustache', '.twig',
        '.liquid', '.haml', '.slim', '.erb', '.rhtml', '.aspx', '.jsp', '.jspx', '.php', '.asp'
    ],
    
    // Template and presentation
    templates: [
        '.pot', '.potx', '.potm', '.pptx', '.pptm', '.ppsx', '.ppsm', '.odp', '.otp', '.key', '.kth'
    ],
    
    // Executable and binary
    executable: [
        '.exe', '.msi', '.app', '.dmg', '.deb', '.rpm', '.appimage', '.snap', '.flatpak', '.pkg',
        '.run', '.bin', '.com', '.bat', '.cmd', '.ps1', '.sh', '.bash', '.zsh', '.fish', '.scr'
    ],
    
    // Game and multimedia
    game: [
        '.unity3d', '.unitypackage', '.asset', '.prefab', '.fbx', '.dae', '.obj', '.3ds', '.blend',
        '.max', '.ma', '.mb', '.c4d', '.lwo', '.lws', '.x', '.md2', '.md3', '.md5', '.bsp', '.map',
        '.wad', '.pk3', '.vpk', '.gcf', '.ncf', '.xnb', '.pak', '.dat', '.big', '.vol'
    ],
    
    // Fonts extended
    fonts_extended: [
        '.pfr', '.sfd', '.vfb', '.ufo', '.designspace', '.glyphs', '.glif'
    ],
    
    // System and temporary
    system: [
        '.tmp', '.temp', '.bak', '.backup', '.old', '.orig', '.swp', '.swo', '.lock', '.lck',
        '.cache', '.pid', '.sock', '.fifo', '.symlink', '.alias', '.lnk', '.url', '.webloc'
    ],
    
    // Database
    database: [
        '.db', '.sqlite', '.sqlite3', '.db-wal', '.sqlite-wal', '.db-shm', '.sqlite-shm', '.mdb',
        '.accdb', '.dbf', '.fdb', '.gdb', '.nsf', '.odb', '.myd', '.myi', '.frm', '.ibd'
    ],
    
    // Compression and disk images
    disk_images: [
        '.iso', '.img', '.dmg', '.vhd', '.vhdx', '.vmdk', '.qcow', '.qcow2', '.vdi', '.hdd', '.parallels'
    ],
    
    // Cryptocurrency and blockchain
    crypto: [
        '.wallet', '.key', '.keystore', '.p12', '.pfx', '.pem', '.crt', '.cer', '.der', '.csr',
        '.p7b', '.p7c', '.spc', '.p7r', '.p10', '.crl', '.pkipath', '.pki'
    ],
    
    // Log files
    logs: [
        '.log', '.logs', '.out', '.err', '.trace', '.debug', '.info', '.warn', '.error', '.fatal'
    ],
    
    // Virtual machine
    vm: [
        '.ova', '.ovf', '.vmx', '.vmware', '.vbox', '.vbox-prev', '.virtualbox', '.qcow', '.qcow2',
        '.raw', '.img', '.vhd', '.vhdx', '.vmdk', '.vdi'
    ],
    
    // Misc binary and special formats
    binary: [
        '.bin', '.dat', '.raw', '.dump', '.hex', '.elf', '.so', '.dylib', '.dll', '.ocx', '.sys',
        '.drv', '.vxd', '.cpl', '.scr', '.fon', '.ttf', '.eot', '.cab', '.msp', '.msu', '.patch'
    ]
};

// Get all asset extensions as a flat array (excluding compiled source files)
const ALL_ASSET_EXTENSIONS = Object.entries(ASSET_EXTENSIONS)
    .filter(([key]) => key !== 'compiled_source')
    .map(([, extensions]) => extensions)
    .flat();

// UI Framework detection patterns
const FRAMEWORK_PATTERNS = {
    react: {
        files: ['App.tsx', 'App.jsx', 'index.tsx', 'index.jsx'],
        deps: ['react', 'react-dom'],
        extensions: ['.tsx', '.jsx']
    },
    vue: {
        files: ['App.vue', 'main.js', 'main.ts'],
        deps: ['vue'],
        extensions: ['.vue']
    },
    angular: {
        files: ['app.component.ts', 'main.ts', 'angular.json'],
        deps: ['@angular/core'],
        extensions: ['.ts']
    },
    svelte: {
        files: ['App.svelte', 'main.js'],
        deps: ['svelte'],
        extensions: ['.svelte']
    },
    solid: {
        files: ['App.tsx', 'index.tsx'],
        deps: ['solid-js'],
        extensions: ['.tsx', '.jsx']
    },
    lit: {
        files: ['*.lit.ts', '*.lit.js'],
        deps: ['lit'],
        extensions: ['.ts', '.js']
    },
    vanilla: {
        files: ['index.js', 'script.js', 'main.js'],
        deps: [],
        extensions: ['.js', '.ts']
    }
};

// HTML template engines and variants
const HTML_VARIANTS = ['.html', '.htm', '.hbs', '.handlebars', '.pug', '.jade', '.ejs', '.njk', '.nunjucks'];

// CSS preprocessors and variants
const CSS_VARIANTS = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'];

interface BuildConfig {
    framework: string;
    hasHtml: boolean;
    htmlFiles: string[];
    entryPoints: string[];
    cssFiles: string[];
    assetFiles: string[];
}

const detectFramework = (pagePath: string): string => {
    const files = readdirSync(pagePath);
    
    // Check for framework-specific files
    for (const [framework, config] of Object.entries(FRAMEWORK_PATTERNS)) {
        for (const pattern of config.files) {
            if (pattern.includes('*')) {
                // Handle wildcard patterns
                const regex = new RegExp(pattern.replace('*', '.*'));
                if (files.some(file => regex.test(file))) {
                    logger.debug(`Detected ${framework} framework via pattern: ${pattern}`);
                    return framework;
                }
            } else {
                if (files.includes(pattern)) {
                    logger.debug(`Detected ${framework} framework via file: ${pattern}`);
                    return framework;
                }
            }
        }
    }
    
    // Check package.json for dependencies
    const packageJsonPath = Path.join(pagePath, 'package.json');
    if (existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            
            for (const [framework, config] of Object.entries(FRAMEWORK_PATTERNS)) {
                if (config.deps.some(dep => dep in deps)) {
                    logger.debug(`Detected ${framework} framework via dependency: ${config.deps.find(dep => dep in deps)}`);
                    return framework;
                }
            }
        } catch (e) {
            logger.warn(`Failed to parse package.json in ${pagePath}`);
        }
    }
    
    // Fallback to vanilla if no framework detected
    logger.debug(`No specific framework detected, using vanilla`);
    return 'vanilla';
};

const analyzePageStructure = (pagePath: string): BuildConfig => {
    const files = readdirSync(pagePath);
    const framework = detectFramework(pagePath);
    
    const config: BuildConfig = {
        framework,
        hasHtml: false,
        htmlFiles: [],
        entryPoints: [],
        cssFiles: [],
        assetFiles: []
    };
    
    files.forEach(file => {
        const ext = Path.extname(file).toLowerCase();
        const fullPath = Path.join(pagePath, file);
        
        if (HTML_VARIANTS.includes(ext)) {
            config.hasHtml = true;
            config.htmlFiles.push(file);
        } else if (CSS_VARIANTS.includes(ext)) {
            config.cssFiles.push(file);
        } else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
            // Determine if this is likely an entry point
            const basename = Path.basename(file, ext).toLowerCase();
            if (['index', 'main', 'app', 'script'].includes(basename)) {
                config.entryPoints.push(file);
            }
        } else if (ALL_ASSET_EXTENSIONS.includes(ext)) {
            config.assetFiles.push(file);
        }
    });
    
    return config;
};

const getWebpackLoaders = (framework: string): any[] => {
    const baseLoaders = [
        // JavaScript/TypeScript
        {
            test: /\.(ts|tsx|js|jsx)$/i,
            exclude: /node_modules/,
            use: {
                loader: 'babel-loader',
                options: {
                    presets: [
                        '@babel/preset-env',
                        '@babel/preset-typescript',
                        ...(framework === 'react' ? ['@babel/preset-react'] : [])
                    ],
                    plugins: [
                        ...(framework === 'solid' ? ['babel-preset-solid'] : []),
                        ...(framework === 'lit' ? ['@babel/plugin-proposal-decorators'] : [])
                    ]
                }
            }
        },
        // CSS and preprocessors
        {
            test: /\.(css|sass|scss|less|styl|stylus)$/i,
            use: [
                MiniCssExtractPlugin.loader,
                'css-loader',
                {
                    loader: 'postcss-loader',
                    options: {
                        postcssOptions: {
                            plugins: [
                                'autoprefixer',
                                'cssnano'
                            ]
                        }
                    }
                },
                'sass-loader',
                'less-loader',
                'stylus-loader'
            ].filter(loader => {
                // Only include loaders that are actually needed
                if (typeof loader === 'string') return true;
                return true; // Include all for now, webpack will ignore unused ones
            })
        },
        // Assets with comprehensive MIME type support (excluding CSS which is handled by CSS loaders)
        {
            test: new RegExp(`\\.(${ALL_ASSET_EXTENSIONS.filter(ext => !['.css', '.scss', '.sass', '.less', '.styl', '.stylus'].includes(ext)).map(ext => ext.slice(1)).join('|')})$`, 'i'),
            type: 'asset/resource'
            // Note: filename is controlled by output.assetModuleFilename
        }
    ];
    
    // Framework-specific loaders
    if (framework === 'vue') {
        baseLoaders.push({
            test: /\.vue$/,
            use: 'vue-loader'
        } as any);
    }
    
    if (framework === 'svelte') {
        baseLoaders.push({
            test: /\.svelte$/,
            use: {
                loader: 'svelte-loader',
                options: {
                    compilerOptions: {
                        dev: false
                    }
                }
            }
        } as any);
    }
    
    // HTML template loaders
    baseLoaders.push(
        {
            test: /\.(hbs|handlebars)$/,
            use: 'handlebars-loader'
        } as any,
        {
            test: /\.pug$/,
            use: 'pug-loader'
        } as any,
        {
            test: /\.ejs$/,
            use: 'ejs-loader'
        } as any,
        {
            test: /\.(njk|nunjucks)$/,
            use: 'nunjucks-loader'
        } as any
    );
    
    return baseLoaders;
};

const getWebpackPlugins = (framework: string, config: BuildConfig, page: string, pagePath: string) => {
    const plugins = [];
    
    // HTML handling based on framework
    if (framework === 'vanilla' && config.hasHtml) {
        // For vanilla projects with existing HTML, clean and use as template content
        const existingHtmlFile = config.htmlFiles[0]; // Use first HTML file found
        const htmlTemplatePath = Path.join(pagePath, existingHtmlFile);
        
        // Read and clean the HTML template
        let htmlContent = readFileSync(htmlTemplatePath, 'utf8');
        
        // Remove existing script and link tags that reference local files
        htmlContent = htmlContent.replace(/<script[^>]*src=["']\.\/[^"']*["'][^>]*><\/script>/gi, '');
        htmlContent = htmlContent.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']\.\/[^"']*["'][^>]*>/gi, '');
        
        plugins.push(new HtmlWebpackPlugin({
            templateContent: htmlContent,
            filename: 'index.html',
            inject: 'body', // Inject scripts at end of body
            minify: {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true
            }
        }));
    } else {
        // For React and other frameworks, generate HTML template
        const htmlTemplate = generateHtmlTemplate(framework);
        plugins.push(new HtmlWebpackPlugin({
            templateContent: htmlTemplate,
            filename: 'index.html',
            inject: 'body',
            minify: {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true
            }
        }));
    }
    
    // CSS extraction
    plugins.push(new MiniCssExtractPlugin({
        filename: '[name].css',
        chunkFilename: '[id].css'
    }));
    
    // Framework-specific plugins
    if (framework === 'vue') {
        const { VueLoaderPlugin } = require('vue-loader');
        plugins.push(new VueLoaderPlugin());
    }
    
    return plugins;
};

const generateHtmlTemplate = (framework: string): string => {
    const baseTemplate = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>App</title>
        </head>
        <body>
            <div id="root"></div>
        </body>
        </html>
    `;
    
    // Framework-specific modifications
    switch (framework) {
        case 'vue':
            return baseTemplate.replace('<div id="root"></div>', '<div id="app"></div>');
        case 'angular':
            return baseTemplate.replace('<div id="root"></div>', '<app-root></app-root>');
        case 'svelte':
            return baseTemplate.replace('<div id="root"></div>', '<div id="app"></div>');
        default:
            return baseTemplate;
    }
};

const runWebpack = async (config: webpack.Configuration): Promise<void> => {
    return new Promise((resolve, reject) => {
        webpack(config, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            const info = stats?.toJson();
            if (stats?.hasErrors()) {
                logger.error(`Webpack errors: ${JSON.stringify(info?.errors)}`);
                reject(info?.errors);
                return;
            }
            if (stats?.hasWarnings()) {
                logger.warn(`Webpack warnings: ${JSON.stringify(info?.warnings)}`);
            }
            // Log stats for debugging
            console.log(stats?.toString({
                colors: true,
                modules: false,
                children: false,
                chunks: false,
                chunkModules: false
            }));
            resolve();
        });
    });
}

const pack = async (page: string, pagePath: string) => {
    logger.info(`Beginning comprehensive webpack for page: ${page}`);
    
    const config = analyzePageStructure(pagePath);
    logger.debug(`Page analysis for ${page}: ${JSON.stringify(config)}`);
    
    if (config.entryPoints.length === 0 && !config.hasHtml) {
        logger.warn(`No entry points found for page: ${page}`);
        return;
    }
    
    // Track temporary files for cleanup
    const tempCleanupFiles: string[] = [];
    
    // Prepare entry points
    const entry: { [key: string]: string } = {};
    
    if (config.entryPoints.length > 0) {
        if (config.framework === 'react') {
            // For React, use index.tsx as the main entry point if it exists
            const indexEntry = config.entryPoints.find(f => f.includes('index.'));
            if (indexEntry) {
                entry['index'] = Path.join(pagePath, indexEntry);
            } else {
                // Use first entry point as main entry
                entry['index'] = Path.join(pagePath, config.entryPoints[0]);
            }
        } else {
            // For other frameworks, use all detected entry points
            config.entryPoints.forEach(entryFile => {
                const entryName = Path.basename(entryFile, Path.extname(entryFile));
                entry[entryName] = Path.join(pagePath, entryFile);
            });
            
            // For vanilla JS with CSS files, create an enhanced entry point that imports CSS
            if (config.framework === 'vanilla' && config.cssFiles.length > 0) {
                const mainEntryName = Object.keys(entry)[0];
                const mainEntryPath = entry[mainEntryName];
                
                // Read the existing JS file
                let jsContent = readFileSync(mainEntryPath, 'utf8');
                
                // Add CSS imports at the top
                const cssImports = config.cssFiles.map(cssFile => `import './${cssFile}';`).join('\n');
                jsContent = cssImports + '\n' + jsContent;
                
                // Create temporary entry file with CSS imports
                const tempEntryPath = Path.join(pagePath, '_webpack_enhanced_entry.js');
                writeFileSync(tempEntryPath, jsContent);
                entry[mainEntryName] = tempEntryPath;
                
                // Store temp file for cleanup
                tempCleanupFiles.push(tempEntryPath);
            }
        }
    } else {
        // Fallback: try to find common entry files
        const fallbackFiles = ['index.js', 'index.ts', 'index.tsx', 'index.jsx', 'script.js', 'main.js', 'app.js', 'app.tsx'];
        for (const fallback of fallbackFiles) {
            const fallbackPath = Path.join(pagePath, fallback);
            if (existsSync(fallbackPath)) {
                entry['index'] = fallbackPath;
                break;
            }
        }
        
        // If still no entry point found, create a minimal one for CSS-only builds
        if (Object.keys(entry).length === 0 && config.cssFiles.length > 0) {
            // Import CSS files in a temporary entry point
            const tempEntryContent = config.cssFiles.map(cssFile => `import './${cssFile}';`).join('\n');
            const tempEntryPath = Path.join(pagePath, '_temp_entry.js');
            require('fs').writeFileSync(tempEntryPath, tempEntryContent);
            entry['index'] = tempEntryPath;
        }
    }
    
    logger.debug(`Entry points for ${page}: ${JSON.stringify(entry)}`);
    
    try {
        const webpackConfig: webpack.Configuration = {
            mode: 'production',
            resolve: {
                extensions: ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '.mjs', '.wasm'],
                alias: {
                    '@': pagePath,
                    '~': pagePath
                }
            },
            optimization: {
                runtimeChunk: false,
                splitChunks: config.framework === 'react' ? false : {
                    cacheGroups: {
                        vendor: {
                            name: 'vendor',
                            chunks: 'all',
                            test: /node_modules/,
                            priority: 20
                        },
                        common: {
                            name: 'common',
                            chunks: 'all',
                            minChunks: 2,
                            priority: 10,
                            reuseExistingChunk: true,
                            enforce: true
                        }
                    }
                },
                minimize: true,
                minimizer: [
                    new TerserWebpackPlugin({ 
                        extractComments: false,
                        terserOptions: {
                            compress: {
                                drop_console: true,
                                drop_debugger: true
                            }
                        }
                    })
                    // Temporarily disable CSS minimizer due to path issues
                    // new CssMinimizerPlugin({
                    //     minimizerOptions: {
                    //         preset: ['default', { discardComments: { removeAll: true } }]
                    //     }
                    // })
                ]
            },
            module: {
                rules: getWebpackLoaders(config.framework)
            },
            plugins: getWebpackPlugins(config.framework, config, page, pagePath),
            stats: {
                children: false,
                modules: false,
                entrypoints: true,
                errors: true,
                warnings: true
            }
        };

        // Configure entry and output for all builds
        webpackConfig.entry = entry;
        webpackConfig.output = {
            path: Path.join(build_dir, page),
            filename: config.framework === 'react' ? 'index.js' : '[name].js',
            assetModuleFilename: (pathData: any) => {
                const ext = Path.extname(pathData.filename || '').toLowerCase();
                // Only put actual assets (images, media, fonts) in assets directory
                // CSS should stay with page files
                if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', 
                     '.mp3', '.mp4', '.ogg', '.wav', '.webm', '.avi', '.mov',
                     '.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
                    return '../../assets/[name][ext]';
                }
                // CSS and other build artifacts stay in page directory
                return '[name][ext]';
            },
            clean: true
        };
        
        await runWebpack(webpackConfig);
        logger.info(`Successfully built page: ${page} (${config.framework})`);
        
        // Cleanup temporary files
        tempCleanupFiles.forEach(tempFile => {
            if (existsSync(tempFile)) {
                unlinkSync(tempFile);
            }
        });
        
    } catch (e) {
        // Cleanup temporary files even on error
        tempCleanupFiles.forEach(tempFile => {
            if (existsSync(tempFile)) {
                unlinkSync(tempFile);
            }
        });
        logger.error(`Failed to build page ${page}: ${e}`);
        throw e;
    }
};

// Main build process
const project_root_dir = Path.join(import.meta.dirname, "../../");
const build_dir = Path.join(project_root_dir, 'build', 'content');

logger.info("Starting comprehensive builder...");
logger.trace(`Args: ${JSON.stringify(process.argv, null, 2)}`);
logger.debug(`Project root: ${project_root_dir}`);
logger.debug(`Build directory: ${build_dir}`);

// Clean and prepare build directories
emptyDirSync(Path.join(project_root_dir, 'build', 'content'));
emptyDirSync(Path.join(project_root_dir, 'build', 'assets'));
emptyDirSync(Path.join(project_root_dir, 'build', 'resource'));

// Copy resources
cpSync(
    Path.join(project_root_dir, 'resource'), 
    Path.join(project_root_dir, 'build', 'resource'), 
    { recursive: true }
);

// Copy source assets to build/assets
const srcAssetsPath = Path.join(project_root_dir, 'src', 'assets');
if (existsSync(srcAssetsPath)) {
    cpSync(
        srcAssetsPath,
        Path.join(project_root_dir, 'build', 'assets'),
        { recursive: true }
    );
    logger.info("Copied source assets to build/assets");
} else {
    logger.warn("No src/assets directory found");
}

// Process all pages
const pages_path = Path.join(project_root_dir, "src", "pages");

(async () => {
    try {
        const pages = readdirSync(pages_path, 'utf8').filter(page => {
            const pagePath = Path.join(pages_path, page);
            return lstatSync(pagePath).isDirectory();
        });
        
        logger.info(`Found ${pages.length} pages to build: ${pages.join(', ')}`);
        
        for (const page of pages) {
            const pagePath = Path.join(pages_path, page);
            try {
                await pack(page, pagePath);
            } catch (error) {
                logger.error(`Failed to build page "${page}": ${error}`);
                // Continue with other pages even if one fails
            }
        }
        
        logger.info("Finished comprehensive build process!");
        
    } catch (error) {
        logger.critical(`Build process failed: ${error}`);
        process.exit(1);
    }
})();