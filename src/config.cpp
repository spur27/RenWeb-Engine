#include "../include/config.hpp"

#include "../include/file.hpp"
#include "../include/info.hpp"
#include "../include/json.hpp"
#include "../include/locate.hpp"
#include <memory>

using Config = RenWeb::Config;
using JSON = RenWeb::JSON;
using File = RenWeb::File;

namespace {
    std::shared_ptr<File> getConfigFile() {
        auto info_file = RenWeb::Info::getInfoFile();
        auto info_packaging_obj = JSON::peek(info_file.get(), "packaging");
        if (info_packaging_obj.is_object() && info_packaging_obj.as_object()["config_path"].is_string()) {
            std::filesystem::path config_path = (info_packaging_obj.as_object()["config_path"].as_string().c_str());
            if (!config_path.is_absolute()) {
                config_path = RenWeb::Locate::currentDirectory() / config_path;
            }
            return std::make_shared<File>(config_path);
        } else {
            return std::make_shared<File>(RenWeb::Locate::currentDirectory() / "config.json");
        }
    }
}

Config::Config(
    std::shared_ptr<ILogger> logger,
    const std::string& current_page
) : JSON(logger, getConfigFile()),
    current_page(current_page)
{ }

Config::Config(
    std::shared_ptr<ILogger> logger,
    const std::string& current_page,
    std::shared_ptr<File> file
) : JSON(logger, file),
    current_page(current_page)
{ }

// Config::~Config();

json::value Config::getProperty(const std::string& key) const /*override*/ {
    try {
        json::value page = JSON::getProperty(this->current_page);
        if (page.is_null()) {
            this->logger->error("[config] Page '" + this->current_page + "' not found in config '" + this->file->getPath().string() + "'. Returning null.");
            return json::value(nullptr);
        }
        return page.at(key);
    } catch (const std::exception& e) {
        this->logger->error("[config] property '" + key + "' not found in page '" + this->current_page + "': " + std::string(e.what()));
        return json::value(nullptr);
    }
}

json::value Config::getDefaultProperty(const std::string& key) const {
    try {
        json::value defaults = JSON::getProperty(this->DEFAULTS_KEY);
        if (defaults.is_null()) {
            this->logger->error("[config] '__defaults__' section not found in config '" + this->file->getPath().string() + "'. Returning null.");
            return json::value(nullptr);
        }
        return defaults.at(key);
    } catch (const std::exception& e) {
        this->logger->error("[config] default property '" + key + "' not found in page '" + this->current_page + "': " + std::string(e.what()));
        return json::value(nullptr);
    }
}

void Config::setProperty(const std::string& key, const json::value& value) /*override*/ {
    try {
        json::value page = JSON::getProperty(this->current_page);
        json::object page_obj;
        
        if (page.is_null()) {
            page_obj = {{key, value}};
        } else if (page.is_object()) {
            page_obj = page.as_object();
            page_obj[key] = value;
        } else {
            throw std::runtime_error("[config] Page '" + this->current_page + "' in config '" + this->file->getPath().string() + "' is neither null nor an object (" + json::serialize(page) + ").");
        }
        
        this->json_data.as_object()[this->current_page] = page_obj;
        this->update(this->json_data.as_object());
    } catch (const std::exception& e) {
        this->logger->error("[config] couldn't set property '" + key + "' in page '" + this->current_page + "': " + std::string(e.what()));
    }
}

void Config::setDefaultProperty(const std::string& key, const json::value& value) {
    try {
        json::value defaults = JSON::getProperty(this->DEFAULTS_KEY);
        json::object defaults_obj;
        
        if (defaults.is_null()) {
            defaults_obj = {{key, value}};
        } else if (defaults.is_object()) {
            defaults_obj = defaults.as_object();
            defaults_obj[key] = value;
        } else {
            throw std::runtime_error("[config] Defaults section in config '" + this->file->getPath().string() + "' is neither null nor an object (" + json::serialize(defaults) + ").");
        }
        
        this->json_data.as_object()[this->DEFAULTS_KEY] = defaults_obj;
        this->update(this->json_data.as_object());
    } catch (const std::exception& e) {
        this->logger->error("[config] couldn't set default property '" + key + "' in page '" + this->current_page + "': " + std::string(e.what()));
    }
}


const json::value& Config::getJson() const /*override*/ {
    try {
        return this->json_data.as_object().at(this->current_page);
    } catch (const std::exception& e) {
        this->logger->error("[config] Couldn't retrieve config.json:  " + std::string(e.what()));
        static const json::value null_value = nullptr;
        return null_value;
    }
}

void Config::update(const json::object &new_data) /*override*/ {
    json::object data = new_data;
    if (!data.contains(this->current_page) || !data.at(this->current_page).is_object()) {
        data = {
            {this->current_page, data}
        };
    }
    JSON::update(data);
}