#pragma once

#include "boost/json/object.hpp"
#include "json.hpp"
#include <boost/json.hpp>
#include <boost/json/serialize.hpp>
#include <memory>
#include <string>

namespace json = boost::json;

namespace RenWeb {
    class Config : public RenWeb::JSON {
        private:
            static constexpr const char* DEFAULTS_KEY = "__defaults__";
        public:
            const std::string initial_page;
            std::string current_page = "";

            Config(std::shared_ptr<ILogger> logger, const std::string& current_page);
            Config(std::shared_ptr<ILogger> logger, const std::string& current_page, std::shared_ptr<File> file);
            ~Config() override = default;
            Config(const Config&) = delete;
            Config& operator=(const Config&) = delete;
            Config(Config&&) = delete;
            Config& operator=(Config&&) = delete;

            json::value getProperty(const std::string& key) const override;
            void setProperty(const std::string& key, const json::value& value) override;
            json::value getDefaultProperty(const std::string& key) const;
            void setDefaultProperty(const std::string& key, const json::value& value);
            const json::value& getJson() const override;
            const json::value& getDefaultsJson() const;
            void update(const json::object &new_data) override;
    };
};
