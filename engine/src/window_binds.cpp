#include "../include/window_binds.hpp"

#include <fstream>
#include <sstream>
#include <stdexcept>
#include <cctype>
#include "file.hpp"
#include "logger.hpp"
#include "page.hpp"
#include "window_helpers.hpp"
#include "window_functions.hpp"
#include "process_manager.hpp"
#include "web_server.hpp"
#include "window.hpp"

using WB = RenWeb::WindowBinds;
using File = RenWeb::File;
using Page = RenWeb::Page;
using namespace RenWeb::WindowHelpers;

WB::WindowBinds(RenWeb::__Window__* window_ref) { 
    this->window_ref = window_ref;
    this->bindBaseFunctions()
        ->bindGetSetFunctions();
}
WB::~WindowBinds() {
  Log::trace("Deconstructing WindowBinds");
}
WB* WB::bindFunction(const std::string& fn_name, std::function<std::string(std::string)> fn) {
    this->window_ref->bind(fn_name, fn);
    spdlog::trace("Bound " + fn_name);
    return this;
}
WB* WB::bindBaseFunctions() {
    WB* wb = this;
    if (wb->window_ref == nullptr) {
        throw std::runtime_error("WindowBinds recieved a nullptr for __Window__ reference.");
    }
// -----------------------------------
// ------------- LOGGING -------------
// -----------------------------------
    this->bindFunction("BIND_log_trace", [](const std::string& req) -> std::string {
            // (msg: Uint8array)
            std::string msg = jsonUint8arrToString(json::parse(req)[0]);
            Log::trace("[CLIENT] " + msg);
            return "null";
        })
        ->bindFunction("BIND_log_debug", [](const std::string& req) -> std::string {
            // (msg: Uint8array)
            std::string msg = jsonUint8arrToString(json::parse(req)[0]);
            Log::debug("[CLIENT] " + msg);
            return "null";
        })
        ->bindFunction("BIND_log_info", [](const std::string& req) -> std::string {
            // (msg: Uint8array)
            std::string msg = jsonUint8arrToString(json::parse(req)[0]);
            Log::info("[CLIENT] " + msg);
            return "null";
        })
        ->bindFunction("BIND_log_warn", [](const std::string& req) -> std::string {
            // (msg: Uint8array)
            std::string msg = jsonUint8arrToString(json::parse(req)[0]);
            Log::warn("[CLIENT] " + msg);
            return "null";
        })
        ->bindFunction("BIND_log_error", [](const std::string& req) -> std::string {
            // (msg: Uint8array)
            std::string msg = jsonUint8arrToString(json::parse(req)[0]);
            Log::error("[CLIENT] " + msg);
            return "null";
        })
        ->bindFunction("BIND_log_critical", [](const std::string& req) -> std::string {
            // (msg: Uint8array)
            std::string msg = jsonUint8arrToString(json::parse(req)[0]);
            Log::critical("[CLIENT] " + msg);
            return "null";
        })
// ---------------------------------------
// ------------- FILE SYSTEM -------------
// ---------------------------------------
        ->bindFunction("BIND_read_file", [](const std::string& req) -> std::string {
            // (path: string)
            std::filesystem::path path (formatPath(jsonUint8arrToString(json::parse(req)[0])));
            if (!std::filesystem::exists(path)) {
                Log::error("No file exists at " + path.string());
                return "null";
            }
            else if (std::filesystem::is_directory(path)) {
                Log::error("readFile can't read directory contents. Use ls for that.");
                return "null";
            }
            std::ifstream file(path, std::ios::binary); // open in binary mode
            if (!file.good()) {
                Log::error("Failed to open file for reading: " + path.string());
                return "null";
            }
            std::vector<char> buffer(std::istreambuf_iterator<char>(file), {});
            file.close();
            Log::debug("Read " + std::to_string(buffer.size()) + " bytes from " + path.string());
            json uint8arr(buffer);
            return uint8arr.dump();
        })
        ->bindFunction("BIND_write_file", [](const std::string& req) -> std::string {
            // (path: string, contents: Uint8array, settings: {append: boolean=false})
            json params = json::parse(req);     
            std::filesystem::path path (jsonUint8arrToString(params[0]));
            std::vector<char> uint8array = (jsonUint8arrToVec(params[1]));
            bool append = (params[2]["append"].is_boolean() && (params[2]["append"].dump() == "true")) ? true : false;
            std::ios::openmode mode = std::ios::binary;
            if (append) {
                mode |= std::ios::app;
            } else {
                mode |= std::ios::trunc;
            }
            std::filesystem::path parent_path = path.parent_path();
            if (std::filesystem::is_directory(path)) {
                Log::error(std::string("Can't write to a directory ") + path.string());
                return "false";
            } else if (!std::filesystem::exists(parent_path)) {
                Log::error(std::string("Directory '") + parent_path.string() + "' doesn't exist.");
                return "false";
            }
            std::ofstream file(path, mode);
            if (file.bad()) {
                Log::error(std::string("Bad file ") + path.string());
                return "falseusing";
            }
            if (uint8array.empty()) {
                Log::debug("Input content empty. Attempting empty write");
            }
            file.write(uint8array.data(), uint8array.size());
            file.close();
            Log::debug(((append) ? "Appended " : "Wrote ") + std::to_string(uint8array.size()) + " bytes to " + path.string());
            return "true";
        })
        ->bindFunction("BIND_exists", [](const std::string& req) -> std::string {
            // (path: string)
            std::filesystem::path path (jsonUint8arrToString(json::parse(req)[0]));
            return (std::filesystem::exists(path)) ? "true" : "false";
        })
        ->bindFunction("BIND_is_dir", [](const std::string& req) -> std::string {
            // (path: string)
            std::filesystem::path path (jsonUint8arrToString(json::parse(req)[0]));
            return (std::filesystem::is_directory(path)) ? "true" : "false";
        })
        ->bindFunction("BIND_mk_dir", [](const std::string& req) -> std::string {
            // (path: string)
            std::filesystem::path path (jsonUint8arrToString(json::parse(req)[0]));
            if (std::filesystem::exists(path)) {
                Log::error("File/dir already exists at '" + path.string() + "'");
                return "false";
            }
            std::error_code ec;
            std::filesystem::create_directory(path, ec);
            if (ec) {
                Log::error(ec.message());
                return "false";
            } else {
                return "true";
            }
        })
        ->bindFunction("BIND_rm", [](const std::string& req) -> std::string {
            // (path: string, settings: {recursive: boolean=false})
            json params = json::parse(req);     
            std::filesystem::path path (jsonUint8arrToString(params[0]));
            bool recursive = (params[1]["recursive"].is_boolean() && (params[1]["recursive"].dump() == "true")) ? true : false;
            std::error_code ec;
            if (!std::filesystem::exists(path)) {
                Log::error("Cannot delete file/dir that doesn't exist: " + path.string());
                return "false";
            } else if (std::filesystem::is_directory(path)) {
                if (recursive) {
                    std::filesystem::remove_all(path, ec);
                } else {
                    std::filesystem::remove(path, ec);
                }
                if (ec) {
                    Log::error(ec.message());
                    return "false";
                } else {
                    return "true";
                }
            }
            std::filesystem::remove(path, ec);
            if (ec) {
                Log::error(ec.message());
                return "false";
            } else {
                return "true";
            }
        })
        ->bindFunction("BIND_ls", [](const std::string& req) -> std::string {
            // (path: string)
            std::filesystem::path path (jsonUint8arrToString(json::parse(req)[0]));
            if (!std::filesystem::is_directory(path)) {
                Log::error("Path entered to ls wasn't a dir: " + path.string());
                return "null";
            }
            std::error_code ec;
            json array = json::array();
            for (const auto& entry : std::filesystem::directory_iterator(path, ec)) {
                array.push_back(strToUint8arrVec(formatPath(entry.path().string())));
            }
            if (ec) {
                Log::error(ec.message());
                return "null";
            } else {
                return array.dump();
            }
        })
        ->bindFunction("BIND_rename", [](const std::string& req) -> std::string {
            // (orig_path: string, new_path: string, settings: {overwrite: boolean=false})
            json params = json::parse(req);     
            std::filesystem::path orig_path (jsonUint8arrToString(params[0]));
            std::filesystem::path new_path (jsonUint8arrToString(params[1]));
            bool overwrite = (params[2]["overwrite"].is_boolean() && (params[2]["overwrite"].dump() == "true")) ? true : false;
            std::error_code ec;
            if (!std::filesystem::exists(orig_path)) {
                Log::error("Can't rename path that doesn't exist: " + orig_path.string());
                return "null";
            } else if (std::filesystem::exists(new_path) && !overwrite) {
                Log::error("Can't overwrite already-existing new path if settings.overwrite is false: " + new_path.string());
                return "null";
            } else if (std::filesystem::exists(new_path)) {
                if (std::filesystem::is_directory(new_path)) {
                    std::filesystem::remove_all(new_path, ec);
                } else {
                    std::filesystem::remove(new_path, ec);
                }
                if (ec) {
                    Log::error(ec.message());
                    return "false";
                }
            }
            std::filesystem::rename(orig_path, new_path, ec);
            if (ec) {
                Log::error(ec.message());
                return "false";
            } else {
                return "true";
            }
        })
        ->bindFunction("BIND_copy", [](const std::string& req) -> std::string {
            // (orig_path: string, new_path: string, settings: {overwrite: boolean=false})
            json params = json::parse(req);     
            std::filesystem::path orig_path (jsonUint8arrToString(params[0]));
            std::filesystem::path new_path (jsonUint8arrToString(params[1]));
            bool overwrite = (params[2]["overwrite"].is_boolean() && (params[2]["overwrite"].dump() == "true")) ? true : false;
            std::error_code ec;
            if (!std::filesystem::exists(orig_path)) {
                Log::error("Can't copy path that doesn't exist: " + orig_path.string());
                return "null";
            } else if (std::filesystem::exists(new_path) && !overwrite) {
                Log::error("Can't overwrite already-existing new path if settings.overwrite is false: " + new_path.string());
                return "null";
            } else if (std::filesystem::exists(new_path)) {
                if (std::filesystem::is_directory(new_path)) {
                    std::filesystem::remove_all(new_path, ec);
                } else {
                    std::filesystem::remove(new_path, ec);
                }
                if (ec) {
                    Log::error(ec.message());
                    return "false";
                }
            }
            if (std::filesystem::is_directory(orig_path)) {
                std::filesystem::copy(orig_path, new_path, std::filesystem::copy_options::recursive, ec);
            } else {
                std::filesystem::copy(orig_path, new_path, ec);
            }
            if (ec) {
                Log::error(ec.message());
                return "false";
            } else {
                return "true";
            }
        })
        ->bindFunction("BIND_choose_files",[wb](const std::string& req) -> std::string {
            // ({multiple: boolean, dirs: boolean, (patterns | mimes): [name: string, rules: string[]]})
            json params = json::parse(req);
            try {
                bool multi = params[0].get<bool>();
                bool dirs = params[1].get<bool>();
                std::vector<std::string> filtration_vec = {};
                json filtration = params[2];
                if (filtration.is_array()) {
                    for (auto& i : filtration) {
                        filtration_vec.push_back(jsonUint8arrToString(i));
                    }
                }
                json initial_path = json::parse(req)[3];
                std::string initial_path_str = File::getDir();
                if (initial_path.is_string()) {
                    initial_path_str = jsonToStr(initial_path);
                }
                json num_vec_vec = json::array();
                for (auto i : wb->window_ref->fns->openChooseFilesDialog(multi, dirs, filtration_vec, initial_path_str)) {
                    num_vec_vec.push_back(json(strToUint8arrVec(i)));
                }
                return num_vec_vec.dump();
            } catch (const std::exception& e) {
                Log::error(std::string("[CLIENT] ") + e.what());
            }
            return json::array().dump();
        })
// ----------------------------------
        ->bindFunction("BIND_get_application_dir_path", [](const std::string& req) -> std::string {
            // ()
            (void)req;
            return json{strToUint8arrVec(File::getDir())}[0].dump();
        })
// ---------------------------------
// ------------- STATE -------------
// ---------------------------------
        ->bindFunction("BIND_is_focus",[wb](const std::string& req) -> std::string {
            (void)req;
            return (wb->window_ref->fns->isFocus())
                ? "true"
                : "false";
        })
// --------------------------------------
// ------------- AUGMENTERS -------------
// --------------------------------------
        ->bindFunction("BIND_show",[wb](const std::string& req) -> std::string {
            json params = json::parse(req);
            bool is_window_shown = params[0].get<bool>();
            wb->window_ref->fns->show(is_window_shown);
            return "null";
        })
// --------------------------------------
        ->bindFunction("BIND_change_title",[wb](const std::string& req) -> std::string {
            json params = json::parse(req);
            std::string title = WindowHelpers::jsonUint8arrToString(params[0]);
            wb->window_ref->fns->changeTitle(title);
            return "null";
        })
// --------------------------------------
        ->bindFunction("BIND_reset_title",[wb](const std::string& req) -> std::string {
            (void)req;
            wb->window_ref->fns->resetTitle();
            return "null";
        })
// --------------------------------------
        ->bindFunction("BIND_reload_page",[wb](const std::string& req) -> std::string {
            (void)req;
            wb->window_ref->fns->reloadPage();
            return "null";
        })
// --------------------------------------
        ->bindFunction("BIND_navigate_page",[wb](const std::string& req) -> std::string {
            json params = json::parse(req);
            try {
                std::string new_page = WindowHelpers::jsonUint8arrToString(params[0]);
                wb->window_ref->fns->navigatePage(new_page);
            } catch (const std::exception& e) {
                Log::error(std::string("[CLIENT] ") + e.what());
            }
            return "null";
        })
// --------------------------------------
        ->bindFunction("BIND_terminate",[wb](const std::string& req) -> std::string {
            (void)req;
            wb->window_ref->fns->terminate();
            return "null";
        })
        ->bindFunction("BIND_open_window", [wb](const std::string& req) -> std::string {
            json params = json::parse(req);
            try {
                std::string uri = WindowHelpers::jsonUint8arrToString(params[0]);
                bool is_single = params[1].get<bool>();
                wb->window_ref->fns->openWindow(uri, is_single);
            } catch (const std::exception& e) {
                Log::error(std::string("[CLIENT] ") + e.what());
            }
            return "null";
        })
// -------------------------------------
        ->bindFunction("BIND_open_URI", [wb](const std::string& req) -> std::string {
            json params = json::parse(req);
            try {
                std::string resource = WindowHelpers::jsonUint8arrToString(params[0]);
                wb->window_ref->fns->openURI(resource);
            } catch (const std::exception& e) {
                Log::error(std::string("[CLIENT] ") + e.what());
            }
            return "null";
        })
// ----------------------------------
// ------------- SYSTEM -------------
// ----------------------------------
        ->bindFunction("BIND_get_PID", [](const std::string& req) -> std::string {
            // ()
            (void)req;
            std::stringstream str;
            str << boost::this_process::get_id();
            return str.str();
        })
// ----------------------------------
        ->bindFunction("BIND_get_OS", [](const std::string& req) -> std::string {
            (void)req;
            #if defined(_WIN32)
                return strToJsonStr("Windows");
            #elif defined(__APPLE__)
                return strToJsonStr("Apple");
            #elif defined(__linux__)
                return strToJsonStr("Linux");
            #endif
        })
// -------------------------------------
        ->bindFunction("BIND_send_notif", [wb](const std::string& req) -> std::string {
            json params = json::parse(req);
            try {
                std::string title = WindowHelpers::jsonUint8arrToString(params[0]);
                std::string message = WindowHelpers::jsonUint8arrToString(params[1]);
                if (params[2].is_null()) {
                    wb->window_ref->fns->sendNotif(title, message);
                } else {
                    std::string icon_path_from_resource = WindowHelpers::jsonUint8arrToString(params[2]);
                    wb->window_ref->fns->sendNotif(title, message, icon_path_from_resource);
                }
            } catch (const std::exception& e) {
                Log::error(std::string("[CLIENT] ") + e.what());
            }
            return "null";
        })
// ------------------------------------
// ------------- SETTINGS -------------
// ------------------------------------
        ->bindFunction("BIND_get_config", [wb](const std::string& req) -> std::string {
            (void)req;
            json config(Page::getPageConfig());
            return config.dump();
        })
// ------------------------------------
        ->bindFunction("BIND_save_config", [wb](const std::string& req) -> std::string {
            (void)req;
            wb->window_ref->fns->saveState();
            return "null";
        })
// ------------------------------------
        ->bindFunction("BIND_load_config", [wb](const std::string& req) -> std::string {
            (void)req;
            wb->window_ref->fns->setState(Page::getPageConfig());
            return "null";
        })
// ------------------------------------
        ->bindFunction("BIND_set_config_property", [wb](const std::string& req) -> std::string {
            json params = json::parse(req);
            std::string key = jsonUint8arrToString(params[0]);
            Page::setProperty(key, params[1]);
            return "null";
        })
// ------------------------------------
        ->bindFunction("BIND_reset_to_defaults", [](const std::string& req) -> std::string {
            (void)req;
            Page::resetPageToDefaults();
            return "null";
        });
    return this;
}
WB* WB::bindGetSetFunctions() {
    WB* wb = this;
    for (const auto& key : this->window_ref->fns->getNames()) {
        this->bindFunction("BIND_get_" + key, [key, wb](const std::string& req) -> std::string {
            (void)req;
            try {
                const json json_v = wb->window_ref->fns->get(key);
                if (json_v.is_string()) 
                    return json(jsonUint8arrToString(json_v)).dump();
                else
                    return json_v.dump();
            } catch (const std::exception& e) {
                Log::error(std::string("[CLIENT] ") + e.what());
                return json(strToUint8arrVec(e.what())).dump();
            }
        })
        ->bindFunction("BIND_set_" + key, [key, wb](const std::string& req) -> std::string {
            try {
                wb->window_ref->fns->set(key, json::parse(req)[0]);
            } catch (const std::exception& e) {
                return json(strToUint8arrVec(e.what())).dump();
            }
            return "null";
        });
    }
    return this;
}
WB* WB::unbindFunction(const std::string& fn_name) {
    this->window_ref->unbind(fn_name);
    spdlog::trace("Unbound " + fn_name);
    return this;
}
