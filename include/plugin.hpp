#pragma once

#include <map>
#include <string>
#include <memory>
#include <boost/json/value.hpp>

namespace json = boost::json;
namespace RenWeb {
#ifndef RENWEB_ILOGGER_DEFINED
#define RENWEB_ILOGGER_DEFINED
     class ILogger {
        public:
            virtual ~ILogger() = default;
            virtual void trace(const std::string& msg) = 0;
            virtual void debug(const std::string& msg) = 0;
            virtual void info(const std::string& msg) = 0;
            virtual void warn(const std::string& msg) = 0;
            virtual void error(const std::string& msg) = 0;
            virtual void critical(const std::string& msg) = 0;
            virtual void refresh(std::map<std::string, std::string> fmt) = 0;
    };
#endif 
    class Plugin {
        protected:
            const std::string name;
            const std::string version;
            const std::string description;
            std::shared_ptr<ILogger> logger;
            std::map<std::string, std::function<json::value(const json::value&)>> functions;
        public:
            Plugin(const std::string& name, const std::string& version, const std::string& description, std::shared_ptr<ILogger> logger)
                : name(name), version(version), description(description), logger(logger) {}
            virtual ~Plugin() = default;
            virtual std::string getName() const { return name; }
            virtual std::string getVersion() const { return version; }
            virtual std::string getDescription() const { return description; }
            virtual const std::map<std::string, std::function<json::value(const json::value&)>>& getFunctions() const {
                return functions;
            }
            virtual json::object getMetadata() const {
                return json::object{
                    {"name", getName()},
                    {"version", getVersion()},
                    {"description", getDescription()}
                };
            }
    };
}

// Template for plugin factory function
// Plugin developers should implement this in their plugin source file:
/*
extern "C" {
    RenWeb::Plugin* createPlugin(std::shared_ptr<RenWeb::ILogger> logger) {
        // Replace with your custom plugin class that inherits from RenWeb::Plugin
        return new RenWeb::Plugin("PluginName", "1.0.0", "Plugin Description", logger);
    }
}
*/