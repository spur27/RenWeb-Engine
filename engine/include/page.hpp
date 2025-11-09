#pragma once 

#include "config.hpp"

// using json = nlohmann::json;

namespace RenWeb {
    class Page : private RenWeb::Config {
        private:
            Page();
            inline static std::string page = "";
        public:
            static const json& getPageConfig();
            static void savePageConfig(const json& json =Page::getPageConfig());
            static void resetPageToDefaults();
          // --------
            template <typename T>
            static T getProperty(const std::string& key) {
                if (page.empty()) {
                    throw std::runtime_error("Can't get page properties while the page hasn't been set!");
                }
                return RenWeb::Config::getProperty<T>(RenWeb::Page::page, key);
            }
            template <typename T>
            static T getProperty(const std::string& key, const T& fallback) {
                if (page.empty()) {
                    return fallback;
                }
                return RenWeb::Config::getProperty<T>(RenWeb::Page::page, key, fallback);
            }
          // --------
            template <typename T>
            static void setProperty(const std::string& key, T setting) {
                if (page.empty()) {
                    throw std::runtime_error("Can't set page properties while the page hasn't been set!");
                }
                RenWeb::Config::setProperty<T>(RenWeb::Page::page, key, setting);
            }
            static const std::string& getPage();
            static void setPage(const std::string& page_name);
            static std::string getTitle();
        };
};