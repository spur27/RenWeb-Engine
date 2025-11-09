#pragma once

#include <nlohmann/json.hpp>
#include "logger.hpp"

using json = nlohmann::json;

namespace RenWeb {
    class JSONFile {
        protected:
            JSONFile();
            static json getFile(const std::filesystem::path& json_path);
            static json getFile(const std::string& json_path);
            static void setFile(const std::filesystem::path& json_path, const json& config);
            static void setFile(const std::string& json_path, const json& config);
          // --------
            template <typename T>
            static T getProperty(const json& json, const std::string& key) {
                try {
                    return json.at(key).get<T>();
                } catch (const json::exception& e) {
                    Log::critical(e.what());
                    throw;
                }
            }
            template <typename T>
            static T getProperty(const json& json, const std::string& key, const T& fallback) {
                try {
                    return JSONFile::getProperty<T>(json, key);
                } catch (const json::exception& e) {
                    Log::critical(e.what());
                    return fallback;
                }
            }
          // --------
            template <typename T>
            static void setProperty(json& json, const std::string& key, T setting) {
                try {
                    json[key] = setting;
                } catch (const json::exception& e) {
                    Log::error(e.what());
                }
            }
    };
};