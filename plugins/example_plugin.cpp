#include "../include/plugin.hpp"

#if defined(_WIN32) || defined(_WIN64)
    #define PLUGIN_EXPORT __declspec(dllexport)
#elif defined(__GNUC__) || defined(__clang__)
    #define PLUGIN_EXPORT __attribute__((visibility("default")))
#else
    #define PLUGIN_EXPORT
#endif

namespace json = boost::json;

class ExamplePlugin : public RenWeb::Plugin {
public:
    ExamplePlugin(std::shared_ptr<RenWeb::ILogger> logger)
        : RenWeb::Plugin(
            "ExamplePlugin", 
            "example", 
            "1.0.0", 
            "Example plugin with math and utility functions", 
            "FAKE: https://github.com/example/example_plugin", 
            logger) 
        {
        logger->info("[example_plugin] Initializing plugin...");
        registerFunctions();
        logger->info("[example_plugin] Plugin initialized successfully!");
    }

    ~ExamplePlugin() override { }

private:
    void registerFunctions() {

        functions["square"] = [this](const json::value& req) -> json::value {
            try {
                const json::value param = req.as_array()[0];
                if (param.is_int64()) {
                    return json::value(param.as_int64() * param.as_int64());
                } else if (param.is_uint64()) {
                    return json::value(param.as_uint64() * param.as_uint64());
                } else if (param.is_double()) {
                    return json::value(param.as_double() * param.as_double());
                } else {
                    throw std::runtime_error("[example_plugin] Invalid parameter type for 'square' function. Expected number.");
                }
            } catch (const std::exception& e) {
                this->logger->error(e.what());
                return json::value(nullptr);
            }
        };

        functions["factorial"] = [this](const json::value& req) -> json::value {
            try {
                const json::value param = req.as_array()[0];
                if (param.is_int64()) {
                    return json::value(std::tgamma(param.as_int64()));
                } else if (param.is_uint64()) {
                    return json::value(std::tgamma(param.as_uint64()));
                } else if (param.is_double()) {
                    return json::value(std::tgamma(param.as_double()));
                } else {
                    throw std::runtime_error("[example_plugin] Invalid parameter type for 'factorial' function. Expected number.");
                }
            } catch (const std::exception& e) {
                this->logger->error(e.what());
                return json::value(nullptr);
            }
        };

        functions["reverse_string"] = [this](const json::value& req) -> json::value {
            try {
                const json::value param = req.as_array()[0];
                const std::string input = this->processInput(param).as_string().c_str();
                std::string reversed(input.rbegin(), input.rend());
                return this->formatOutput(json::value(reversed));
            } catch (const std::exception& e) {
                this->logger->error(e.what());
                return json::value(nullptr);
            }
        };

    }
};

/**
 * @brief Plugin factory function
 * This function is called by the PluginManager to create an instance of the plugin
 */
extern "C" PLUGIN_EXPORT RenWeb::Plugin* createPlugin(std::shared_ptr<RenWeb::ILogger> logger) {
    return new ExamplePlugin(logger);
}
