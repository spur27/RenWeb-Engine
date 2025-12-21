#pragma once

#include <boost/json/value.hpp>
#include <filesystem>
#include <functional>
#include <memory>
#include "file.hpp"
#include "config.hpp"
#include "managers/in_out_manager.hpp"
#include "managers/callback_manager.hpp"

using File = RenWeb::File;
using Config = RenWeb::Config;
namespace json = boost::json;
using IOM = RenWeb::InOutManager<std::string, json::value, const json::value&>;
using CM = RenWeb::CallbackManager<std::string, json::value, const json::value&>;

namespace RenWeb {
   class App;
}

namespace RenWeb {
    class WindowFunctions {
        private:
            RenWeb::App* app;
            WindowFunctions* bindDefaults();
            WindowFunctions* setGetSets();
            WindowFunctions* setWindowCallbacks();
            WindowFunctions* setLogCallbacks();
            WindowFunctions* setFileSystemCallbacks();
            WindowFunctions* setConfigCallbacks();
            WindowFunctions* setSystemCallbacks();
            WindowFunctions* setProcessCallbacks();
            WindowFunctions* setSignalCallbacks();
            WindowFunctions* setDebugCallbacks();
            WindowFunctions* setNetworkCallbacks();
            WindowFunctions* setNavigateCallbacks();
            std::map<std::string, json::value> saved_states;
            
            // Helper methods for string/character array conversion
            json::value formatOutput(const json::value& output);
            json::value formatOutput(const std::string& output);
            template<typename T>
                json::value formatOutput(const T& output);
            json::value processInput(const std::string& input);
            json::value processInput(const json::value& input);
            json::value processInput(const json::object& input);
            json::value processInput(const json::array& input);
            json::value getSingleParameter(const json::value& param);
        public:
            std::unique_ptr<IOM> getsets;
            std::unique_ptr<CM> window_callbacks;
            std::unique_ptr<CM> log_callbacks;
            std::unique_ptr<CM> filesystem_callbacks;
            std::unique_ptr<CM> config_callbacks;
            std::unique_ptr<CM> system_callbacks;
            std::unique_ptr<CM> process_callbacks;
            std::unique_ptr<CM> signal_callbacks;
            std::unique_ptr<CM> debug_callbacks;
            std::unique_ptr<CM> network_callbacks;
            std::unique_ptr<CM> navigate_callbacks;
            

            WindowFunctions(RenWeb::App* app);
            ~WindowFunctions();
            WindowFunctions* bindFunction(const std::string&, std::function<std::string(std::string)>);
            WindowFunctions* unbindFunction(const std::string&);
            json::value get(const std::string& property);
            void set(const std::string& property, const json::value& value);
            json::object getState();
            void setState(const json::object& json);
            void saveState();
         // ------------ state -----------------
            bool isFocus();
    };
};