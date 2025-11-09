#include "../include/config.hpp"

#include <iostream>

#include "file.hpp"

using Config = RenWeb::Config;
using JSONFile = RenWeb::JSONFile;
using File = RenWeb::File;

Config::Config() {
    throw std::runtime_error("Tried to construct static class Config");
}
/*static*/ json Config::getConfigFile() {
    return JSONFile::getFile(Config::getPath());
}
/*static*/ const json& Config::getConfig() {
    return Config::config;
}
/*static*/ std::filesystem::path Config::getPath() {
    return std::filesystem::path(File::getDir()).append(CONFIG_FILE_NAME);
}
/*static*/ void Config::saveConfigToFile(const json& config_v) {
    Config::config.update(config_v, true);
    std::cout << "UPDATED CONFIG" << std::endl;
    std::cout << Config::config.dump(2) << std::endl;
    JSONFile::setFile(Config::getPath(), Config::config);
}
/*static*/ void Config::resetToDefault(const std::string& page_name) {
    if (page_name.empty()) {
        Log::error("Can't load defaults if the set page is empty!");
    } else if (Config::config.contains(page_name) && Config::config.at(page_name).contains("__default__")) {
        Log::debug("Resetting defaults to those defined for page \"" + page_name + "\".");
        Config::config[page_name].update(Config::config.at(page_name).at("__default__"), true);
    } else if (Config::config.contains("__default__")) {
        Log::warn("Resetting defaults to those defined at config.json root.");
        Config::config[page_name].update(Config::config.at("__default__"), true);
    } else {
        Log::error("Property \"__default__\" is not set for page \"" + page_name + "\" nor at config.json root. Cannot reset to defaults.");
    }
}