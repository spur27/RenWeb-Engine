#include "../include/page.hpp"

#include <iostream>

#include "../include/info.hpp"
#include "logger.hpp"

using Page = RenWeb::Page;
using Info = RenWeb::Info;
using Config = RenWeb::Config;

Page::Page() {
    throw std::runtime_error("Tried to construct static class Page");
}
/*static*/ const json& Page::getPageConfig() {
    if (Page::getPage().empty()) {
        throw std::runtime_error("Can't get page properties while the page hasn't been set!");
    }
    if (!Config::getConfig().contains(Page::page)) {
        Log::warn("Config at \"" + Config::getPath().string() + "\" doesn't have settings for page " + Page::page);
        Config::setProperty(Page::getPage(), json::object());
    }
    return Config::getConfig().at(Page::getPage());
}
/*static*/ void Page::savePageConfig(const json& json_v) {
    if (Page::page.empty()) {
        throw std::runtime_error("Can't save page config while the page hasn't been set!");
    }
    json updated_json = json::object();
    updated_json[Page::getPage()] = json_v;
    Config::saveConfigToFile(updated_json);
}
/*static*/ void Page::resetPageToDefaults() {
    if (Page::page.empty()) {
        throw std::runtime_error("Can't reset page to defaults while the page hasn't been set!");
    }
    Config::resetToDefault(Page::page);
}
/*static*/ const std::string& Page::getPage() {
    return Page::page;
}
/*static*/ void Page::setPage(const std::string& page_name) {
    Log::info("Page set to " + page_name);
    if (!Config::getConfig().contains(page_name)) {
        Log::error("Newly set page " + page + " doesn't exist in the config. Adding to config...");
        Config::setProperty(page_name, json::object());
    }
    Page::page = page_name;
}
/*static*/ std::string Page::getTitle() {
    if (Page::page.empty()) {
        return Info::getProperty<std::string>("title", "UNKNOWN TITLE");
    } else if (!Page::getPageConfig().contains("title")) {
        return Info::getProperty<std::string>("title", "UNKNOWN TITLE");
    } else {
        return Page::getProperty<std::string>("title");
    }
}


