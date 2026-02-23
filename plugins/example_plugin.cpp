/**
 * @file example_plugin.cpp
 * @brief Example RenWeb plugin demonstrating the plugin system
 * 
 * This demonstrates how to create a plugin for RenWeb engine.
 * Plugins can register custom functions that can be called from JavaScript.
 * 
 * Build instructions (Linux):
 *   g++ -shared -fPIC example_plugin.cpp -o example_plugin.so -I../include -std=c++17
 * 
 * Build instructions (macOS):
 *   g++ -shared -fPIC example_plugin.cpp -o example_plugin.dylib -I../include -std=c++17
 * 
 * Build instructions (Windows):
 *   cl /LD example_plugin.cpp /I..\include /Fe:example_plugin.dll
 */

#include "../include/plugin.hpp"
#include <boost/json.hpp>
#include <cmath>

namespace json = boost::json;

/**
 * @brief Example plugin that provides custom mathematical and utility functions
 */
class ExamplePlugin : public RenWeb::Plugin {
public:
    ExamplePlugin(std::shared_ptr<RenWeb::ILogger> logger)
        : RenWeb::Plugin("ExamplePlugin", "1.0.0", "Example plugin with math and utility functions", logger) {
        
        // Log initialization
        logger->info("[ExamplePlugin] Initializing plugin...");
        
        // Register custom functions
        registerFunctions();
        
        logger->info("[ExamplePlugin] Plugin initialized successfully!");
    }

    ~ExamplePlugin() override {
        // Cleanup if needed
    }

private:
    void registerFunctions() {
        // Example 1: Square function
        functions["square"] = [this](const json::value& req) -> json::value {
            try {
                if (!req.is_object()) {
                    return json::object{{"error", "Request must be an object"}};
                }
                
                auto& obj = req.as_object();
                if (!obj.contains("value")) {
                    return json::object{{"error", "Missing 'value' parameter"}};
                }
                
                double value = obj.at("value").as_double();
                double result = value * value;
                
                return json::object{
                    {"result", result},
                    {"input", value}
                };
            } catch (const std::exception& e) {
                return json::object{{"error", e.what()}};
            }
        };

        // Example 2: Factorial function
        functions["factorial"] = [this](const json::value& req) -> json::value {
            try {
                if (!req.is_object()) {
                    return json::object{{"error", "Request must be an object"}};
                }
                
                auto& obj = req.as_object();
                if (!obj.contains("n")) {
                    return json::object{{"error", "Missing 'n' parameter"}};
                }
                
                int64_t n = obj.at("n").as_int64();
                if (n < 0) {
                    return json::object{{"error", "Factorial not defined for negative numbers"}};
                }
                if (n > 20) {
                    return json::object{{"error", "Number too large (max 20)"}};
                }
                
                int64_t result = 1;
                for (int64_t i = 2; i <= n; i++) {
                    result *= i;
                }
                
                return json::object{
                    {"result", result},
                    {"input", n}
                };
            } catch (const std::exception& e) {
                return json::object{{"error", e.what()}};
            }
        };

        // Example 3: Power function
        functions["power"] = [this](const json::value& req) -> json::value {
            try {
                if (!req.is_object()) {
                    return json::object{{"error", "Request must be an object"}};
                }
                
                auto& obj = req.as_object();
                if (!obj.contains("base") || !obj.contains("exponent")) {
                    return json::object{{"error", "Missing 'base' or 'exponent' parameter"}};
                }
                
                double base = obj.at("base").as_double();
                double exponent = obj.at("exponent").as_double();
                double result = std::pow(base, exponent);
                
                return json::object{
                    {"result", result},
                    {"base", base},
                    {"exponent", exponent}
                };
            } catch (const std::exception& e) {
                return json::object{{"error", e.what()}};
            }
        };

        // Example 4: Reverse string function
        functions["reverse_string"] = [this](const json::value& req) -> json::value {
            try {
                if (!req.is_object()) {
                    return json::object{{"error", "Request must be an object"}};
                }
                
                auto& obj = req.as_object();
                if (!obj.contains("text")) {
                    return json::object{{"error", "Missing 'text' parameter"}};
                }
                
                std::string text = std::string(obj.at("text").as_string());
                std::string reversed(text.rbegin(), text.rend());
                
                return json::object{
                    {"result", reversed},
                    {"original", text}
                };
            } catch (const std::exception& e) {
                return json::object{{"error", e.what()}};
            }
        };

        // Example 5: Get plugin info
        functions["info"] = [this](const json::value& req) -> json::value {
            (void)req; // Unused parameter
            return json::object{
                {"name", getName()},
                {"version", getVersion()},
                {"description", getDescription()},
                {"functions", json::array{"square", "factorial", "power", "reverse_string", "info"}}
            };
        };
    }
};

/**
 * @brief Plugin factory function
 * This function is called by the PluginManager to create an instance of the plugin
 */
extern "C" {
    RenWeb::Plugin* createPlugin(std::shared_ptr<RenWeb::ILogger> logger) {
        return new ExamplePlugin(logger);
    }
}
