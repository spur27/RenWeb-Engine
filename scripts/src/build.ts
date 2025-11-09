// add webview stuff
import webpack from 'webpack';
import TerserWebpackPlugin from 'terser-webpack-plugin';
import { readdirSync, lstatSync, cpSync, existsSync } from 'fs';
import Path from 'path';
import { LogLevel, Logger } from '../lib/logger.ts';
import Chalk from 'chalk';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { execSync, spawn } from 'child_process';
import HtmlBundlerWebpackPlugin from 'html-bundler-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { emptyDirSync } from 'fs-extra';

const logger = new Logger("Builder", false, LogLevel.TRACE, Chalk.bold.magenta);

const throwCriticalError = (msg: any) => {
    logger.critical(msg);
    throw new Error(msg);
}

const runWebpack = async (config: webpack.Configuration): Promise<void> => {
    return new Promise((resolve, reject) => {
        webpack(config, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            const info = stats?.toJson();
            if (stats?.hasErrors()) {
                reject(info?.errors);
            }
            if (stats?.hasWarnings()) {
                logger.warn(info?.warnings);
            }
            resolve();
        });
    });
}

const project_root_dir = Path.join(import.meta.dirname, "../../");
const build_dir = Path.join(project_root_dir, 'build', 'content');

logger.info("Starting builder...");
logger.trace(`Args are ${JSON.stringify(process.argv, null, 2)}`);
logger.debug(`Project root dir is \n\t'${project_root_dir}'`);
logger.debug(`Build dir is \n\t'${build_dir}'`);


const pack = async (page: string, path: string, filename: string) => {
    const fullpath = Path.join(path, filename);
    logger.info(`Beginning webpack for\n\t'${fullpath}'`);

    const is_html = filename.endsWith('.html');
    const filename_no_ext = filename.substring(0, filename.lastIndexOf("."));

    try {
        await runWebpack({
            entry: is_html ? {} : { [filename_no_ext]: fullpath },
            output: {
                path: Path.join(build_dir, page),
                filename: '[name].js',
                assetModuleFilename: `./[name][ext]`
            },
            mode: 'development',
            resolve: {
                extensions: ['.tsx', '.ts', '.jsx', '.js']
            },
            optimization: {
                runtimeChunk: false,
                splitChunks: false,
                minimize: true,
                minimizer: [
                    new TerserWebpackPlugin({ extractComments: false }),
                    new CssMinimizerPlugin()
                ]
            },
            module: {
                rules: [
                    {
                        test: /\.(ts|tsx|js|jsx)$/i,
                        exclude: /node_modules/,
                        use: {
                            loader: 'babel-loader',
                            options: {
                                presets: [
                                    '@babel/preset-env',
                                    '@babel/preset-react',
                                    '@babel/preset-typescript'
                                ]
                            }
                        }
                    },
                    {
                        test: /\.(css|sass|scss)$/i,
                        use: 
                            ((is_html)
                                ? ['css-loader', 'sass-loader']
                                : [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader']
                            )
                    },
                    {
                        test: /\.(png|jpe?g|gif|svg|woff2?|eot|ttf|mp[34]|otf|wav|ogg|ico)$/i,
                        type: 'asset/resource',
                        generator: {
                            filename: '../../assets/[name][ext]'
                        }
                    }
                ]
            },
            plugins:
                (is_html)
                    ? 
                      [
                        new HtmlBundlerWebpackPlugin({
                        //preprocessor: 'handlebars',
                        entry: `../src/pages/${page}`,
                        minify: true
                    })
                  ]
                : 
                  [
                    new HtmlWebpackPlugin({
                        templateContent: ({ htmlWebpackPlugin }) => `
                            <!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8" />
                                <title>Inline React Template</title>
                            </head>
                            <body>
                                <div id="root"></div>
                            </body>
                            </html>
                        `,
                        filename: 'index.html',       
                        inject: 'body', 
                        minify: true
                    }),
                    new MiniCssExtractPlugin({
                        filename: 'style.css'
                    })
                  ]
        });
    } catch (e) {
        logger.error(e);
    }
};


const include_names = [
    'index'
]
const exclude_types = [
    '.css'
];

emptyDirSync(Path.join(project_root_dir, 'build', 'content'));
emptyDirSync(Path.join(project_root_dir, 'build', 'assets'));
emptyDirSync(Path.join(project_root_dir, 'build', 'resource'));
cpSync(Path.join(project_root_dir, 'engine', 'resource'), Path.join(project_root_dir, 'build', 'resource'), {recursive: true});

const pages_path = Path.join(project_root_dir, "src", "pages");
(async () => { 
        for (const page of readdirSync(pages_path, 'utf8')) {
            let entry_point_found = false;
            const curr_page_path = Path.join(pages_path, page);
            for (const file of readdirSync(curr_page_path, 'utf8')) {
                const filename = file.substring(0, file.lastIndexOf("."));
                const ext = file.substring(file.lastIndexOf("."));
                if (include_names.includes(filename) && !exclude_types.includes(ext)) {
                    await pack(page, curr_page_path, file);
                    entry_point_found = true;
                    break;
                }
            }
            if (!entry_point_found) {
                logger.error(`No entry point found for "${curr_page_path}"`);
            }
        }
        return;
})();

logger.info("Finished with webpacking.");

// project_process.unref();
