#pragma once

#include <memory>
#include <boost/json.hpp>
// #include <nlohmann/json.hpp>
#include "file.hpp"
#include "interfaces/Ilogger.hpp"

using File = RenWeb::File;
using ILogger = RenWeb::ILogger;
namespace json = boost::json;

namespace RenWeb {
    class JSON {
        protected:
            std::shared_ptr<ILogger> logger;
            json::value json_data;
        public:
            std::shared_ptr<File> file;

            JSON(std::shared_ptr<ILogger> logger, std::shared_ptr<File> file);

            static json::value peek(File* file, const std::string& key);
            static json::object merge(json::object old_data, const json::object& new_data);
            virtual const json::value& getJson() const;
            virtual json::value getProperty(const std::string& key) const;
            virtual void setProperty(const std::string& key, const json::value& value);
            virtual void update(const json::object& new_data);
    };
};