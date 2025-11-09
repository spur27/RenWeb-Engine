#pragma once

#define INFO_FILE_NAME "info.json"

#include "json_file.hpp"

namespace RenWeb {
    class Info : public RenWeb::JSONFile {
        public:
            static std::filesystem::path getPath();
        private:
            inline static json info_json = RenWeb::JSONFile::getFile(Info::getPath());
            Info();
        public:
            static json getInfoFile();
            static const json& getInfo();
            static void saveInfoToFile(const json& config =RenWeb::Info::info_json);
          // --------
            template <typename T>
            static T getProperty(const std::string& key) {
                return RenWeb::JSONFile::getProperty<T>(RenWeb::Info::info_json, key);
            }
            template <typename T>
            static T getProperty(const std::string& key, const T& fallback) {
                return RenWeb::JSONFile::getProperty<T>(RenWeb::Info::info_json, key, fallback);
            }
          // --------
            template <typename T>
            static void setSetting(const std::string& key, T setting) {
                RenWeb::JSONFile::setProperty<T>(RenWeb::Info::info_json, key, setting);
            }
    };
};