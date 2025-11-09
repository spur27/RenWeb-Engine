#pragma once

#define CONFIG_FILE_NAME "config.json"

#include "json_file.hpp"

namespace RenWeb {
    class Config : public RenWeb::JSONFile {
        public:
            static std::filesystem::path getPath();
        private:
            inline static json config = RenWeb::JSONFile::getFile(Config::getPath());
        protected:
            Config();
        public:
            static json getConfigFile();
            static const json& getConfig();
            static void saveConfigToFile(const json& config);
            static void resetToDefault(const std::string& page_name);
          // --------
            template <typename T>
            static T getProperty(const std::string& page, const std::string& key) {
                return RenWeb::JSONFile::getProperty<T>(RenWeb::Config::config.at(page), key);
            }
            template <typename T>
            static T getProperty(const std::string& page, const std::string& key, const T& fallback) {
                return RenWeb::JSONFile::getProperty<T>(RenWeb::Config::config.at(page), key, fallback);
            }
          // --------
            template <typename T>
            static void setProperty(const std::string& page, const std::string& key, T setting) {
                RenWeb::JSONFile::setProperty<T>(RenWeb::Config::config.at(page), key, setting);
            }
            template <typename T>
            static void setProperty(const std::string& page, T setting) {
                RenWeb::JSONFile::setProperty<T>(RenWeb::Config::config, page, setting);
            }
    };
};
