#pragma once

#include "json.hpp"
#include <boost/json.hpp>
#include <boost/json/serialize.hpp>
#include <memory>
#include <string>

namespace json = boost::json;

namespace RenWeb {
    class Config : public RenWeb::JSON {
        private:
            const std::string DEFAULTS_KEY = "__defaults__";
        public:
            std::string current_page = "";

            Config(std::shared_ptr<ILogger> logger, const std::string& current_page);
            Config(std::shared_ptr<ILogger> logger, const std::string& current_page, std::shared_ptr<File> file);
            // ~Config();

            json::value getProperty(const std::string& key) const override;
            void setProperty(const std::string& key, const json::value& value) override;
            json::value getDefaultProperty(const std::string& key) const;
            void setDefaultProperty(const std::string& key, const json::value& value);
            const json::value& getJson() const override;
            void update(const json::object &new_data) override;
    };
};
