// add webview stuff
import { readFileSync } from 'fs';
import Path from 'path';
import { LogLevel, Logger } from './logger.ts';
import Chalk from 'chalk';
import { execSync } from 'child_process';


export type Info = {
    author: string,
    simple_author: string,
    description: string,
    license: string,
    title: string,
    simple_title: string,
    version: string,
    repository?: string,
    category: string,
    copyright?: string,
    app_id: string,
    starting_pages: string[],
};

export function getInfo(): Info {
    const project_root_dir = Path.join(import.meta.dirname, "../../");
    const info_json = Path.join(project_root_dir, "info.json");
    const logger = new Logger("GetInfo", false, LogLevel.TRACE, Chalk.bold.magenta);
    const default_info: Info = {
        author: "DefaultAuthor",
        simple_author: "default-author",
        description: "I am a default description",
        license: "MIT",
        title: "RenWeb",
        simple_title: "renweb",
        version: "0.0.0",
        category: "Utility",
        app_id: `io.github.DefaultAuthor.renweb`,
        starting_pages: ["example"]
    };
    try {
        const info_json_v = JSON.parse(readFileSync(info_json, 'utf8'));
        if (info_json_v == null) {
            return default_info;
        } else {
            return  {
                author: info_json_v["author"] ?? default_info["author"],
                simple_author: info_json_v["author"]?.trim()?.replaceAll(/\s/g, "-")?.toLowerCase() ?? default_info["simple_author"],
                description: info_json_v["description"] ?? default_info["description"],
                license: info_json_v["license"] ?? default_info["license"],
                title: info_json_v["title"] ?? default_info["title"],
                simple_title: info_json_v["title"]?.trim()?.replaceAll(/\s/g, "-")?.toLowerCase() ?? default_info["simple_title"],
                version: info_json_v["version"] ?? default_info["version"],
                repository: info_json_v["repository"] ?? default_info["repository"],
                category: info_json_v["category"] ?? default_info["category"],
                copyright: info_json_v["copyright"] ?? default_info["copyright"],
                app_id: info_json_v["app_id"] ?? default_info["app_id"],
                starting_pages: info_json_v["starting_pages"] ?? default_info["starting_pages"]
            }
        }
    } catch (e) {
        logger.error(e);
        return default_info;
    }
}

export function getLinuxPMType(): string {
    try {
        if (execSync("dpkg --version")) {
            return 'deb';
        }
    } catch (e) { }
    try {
        if (execSync("rpm --version")) {
            return 'rpm';
        }
    } catch (e) { }
    return "";
}