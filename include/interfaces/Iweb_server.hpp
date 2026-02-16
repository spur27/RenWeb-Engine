#pragma once

#include <boost/json.hpp>

namespace json = boost::json;

namespace RenWeb {
    class IWebServer {
        public:
            virtual ~IWebServer() = default;
            
            virtual std::string getURL() const = 0;
            virtual const std::vector<json::value>& getMessages() const = 0;
            virtual void start() = 0;
            virtual void stop() = 0;
            virtual bool isURI(const std::string& uri) const = 0;
            virtual void sendMessage(const std::string& ip, const json::value& message, time_t timeout_s=2, time_t timeout_ms=0) const = 0;
            virtual json::object whoAreYou(const std::string& ip, time_t timeout_s=2, time_t timeout_ms=0) const = 0;
    };
}