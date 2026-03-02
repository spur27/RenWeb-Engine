#pragma once

#include <map>
#include <string>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <type_traits>
#include <boost/json/value.hpp>
#include <boost/json/array.hpp>
#include <boost/json/object.hpp>
#include <boost/json/parse.hpp>

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
            const std::string internal_name;
            const std::string version;
            const std::string description;
            const std::string repository_url;
            std::shared_ptr<ILogger> logger;
            std::map<std::string, std::function<json::value(const json::value&)>> functions;
            
            json::value processInput(const std::string& input) {
                return this->processInput(json::parse(input));
            }
            
            json::value processInput(const json::value& input) {
                switch (input.kind()) {
                    case json::kind::string:
                        this->logger->warn("[plugin] Received string in processInput(std::string)");
                        [[fallthrough]];
                    case json::kind::int64:
                    case json::kind::uint64:
                    case json::kind::double_:
                    case json::kind::bool_:
                    case json::kind::null:
                        return input;
                    case json::kind::array:
                        return this->processInput(input.as_array());
                    case json::kind::object:
                        return this->processInput(input.as_object());
                    default:
                        throw std::runtime_error("[plugin] Unsupported JSON value kind in processInput(std::string)");
                }
            }
            
            json::value processInput(const json::object& input) {
                if (input.contains("__encoding_type__") && input.at("__encoding_type__").is_string() && input.contains("__val__")) {
                    if (input.at("__encoding_type__").as_string() == "base64" && input.at("__val__").is_array()) {
                        std::stringstream ss;
                        for (const auto& item : input.at("__val__").as_array()) {
                            ss << char(item.as_int64());
                        }
                        return json::value(ss.str());
                    }
                    throw std::runtime_error("[plugin] Unsupported encoding type in processInput(json::object): " + std::string(input.at("__encoding_type__").as_string()));
                } else {
                    json::object processed_input;
                    for (const auto& item : input) {
                        processed_input[item.key()] = this->processInput(item.value());
                    }
                    return processed_input;
                }
            }
            
            json::value processInput(const json::array& input) {
                json::array processed_input;
                for (const auto& item : input) {
                    processed_input.push_back(this->processInput(item));
                }
                return processed_input;
            }
            
            json::value formatOutput(const json::value& output) {
                json::array formatted_output_arr;
                json::object formatted_output_obj;
                switch (output.kind()) {
                    case json::kind::string:
                        return this->formatOutput(output.as_string().c_str());
                    case json::kind::int64:
                    case json::kind::uint64:
                    case json::kind::double_:
                    case json::kind::bool_:
                    case json::kind::null:
                        return output;
                    case json::kind::array:
                        for (const auto& item : output.as_array()) {
                            formatted_output_arr.push_back(this->formatOutput(item));
                        }
                        return formatted_output_arr;
                    case json::kind::object:
                        for (const auto& item : output.as_object()) {
                            formatted_output_obj[item.key()] = this->formatOutput(item.value());
                        }
                        return formatted_output_obj;
                    default:
                        throw std::runtime_error("[plugin] Unsupported JSON value kind in formatOutput");
                }
            }
            
            json::value formatOutput(const std::string& output) {
                json::object formatted_output = {
                    {"__encoding_type__", "base64"},
                    {"__val__", json::array()}
                };
                json::array& val_array = formatted_output["__val__"].as_array();
                for (const char& ch : output) {
                    val_array.push_back(static_cast<int64_t>(ch));
                }
                return formatted_output;
            }
            
            template <typename T>
            json::value formatOutput(const T& output) {
                // Convert to std::string first to avoid infinite recursion with const char*
                if constexpr (std::is_same_v<T, const char*> || std::is_same_v<T, char*>) {
                    return this->formatOutput(std::string(output));
                } else {
                    return this->formatOutput(json::value(output));
                }
            }
            
        public:
            Plugin(const std::string& name, const std::string& internal_name, const std::string& version, const std::string& description, const std::string& repository_url, std::shared_ptr<ILogger> logger)
                : name(name)
                , internal_name(internal_name)
                , version(version)
                , description(description)
                , repository_url(repository_url)
                , logger(logger) {}
            virtual ~Plugin() = default;
            std::string getName() const { return name; }
            std::string getInternalName() const { return internal_name; }
            std::string getVersion() const { return version; }
            std::string getDescription() const { return description; }
            std::string getRepositoryUrl() const { return repository_url; }
            const std::map<std::string, std::function<json::value(const json::value&)>>& getFunctions() const {
                return functions;
            }
            json::object getMetadata() const {
                return json::object{
                    {"name", getName()},
                    {"internal_name", getInternalName()},
                    {"version", getVersion()},
                    {"description", getDescription()},
                    {"repository_url", getRepositoryUrl()}
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