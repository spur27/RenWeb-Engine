#pragma once

#include <string>
#include <map>
#include <vector>
#include <memory>
#include <filesystem>
#include "../plugin.hpp"
#include "../locate.hpp"

#ifndef _WIN32
    #include <dlfcn.h>
#else
    #include <windows.h>
#endif

namespace RenWeb {
    // Function pointer type for plugin factory
    typedef RenWeb::Plugin* (*CreatePluginFunc)(std::shared_ptr<ILogger>);
    
    class PluginManager {
        private:
            std::shared_ptr<ILogger> logger;
            
            std::map<std::string, std::unique_ptr<Plugin>> plugins;
           
            void loadPlugin(const std::filesystem::path& path) {
                try {
                    #if defined(_WIN32)
                        HMODULE handle = LoadLibraryA(path.string().c_str());
                        if (!handle) {
                            logger->error("[plugins] Failed to load plugin: " + path.string() + " - " + std::to_string(GetLastError()));
                            return;
                        }
                        
                        SetLastError(0);
                        
                        CreatePluginFunc createFunc = (CreatePluginFunc)GetProcAddress(handle, "createPlugin");
                        if (!createFunc) {
                            logger->error("[plugins] Failed to find createPlugin in: " + path.string() + " - " + std::to_string(GetLastError()));
                            FreeLibrary(handle);
                            return;
                        }
                        
                        RenWeb::Plugin* plugin_raw = createFunc(logger);
                        if (!plugin_raw) {
                            logger->error("[plugins] createPlugin returned null for: " + path.string());
                            FreeLibrary(handle);
                            return;
                        }
                    #else
                        void* handle = dlopen(path.string().c_str(), RTLD_LAZY);
                        if (!handle) {
                            logger->error("[plugins] Failed to load plugin: " + path.string() + " - " + dlerror());
                            return;
                        }
                        
                        dlerror();
                        
                        CreatePluginFunc createFunc = (CreatePluginFunc)dlsym(handle, "createPlugin");
                        const char* dlsym_error = dlerror();
                        if (dlsym_error) {
                            logger->error("[plugins] Failed to find createPlugin in: " + path.string() + " - " + dlsym_error);
                            dlclose(handle);
                            return;
                        }
                        
                        RenWeb::Plugin* plugin_raw = createFunc(logger);
                        if (!plugin_raw) {
                            logger->error("[plugins] createPlugin returned null for: " + path.string());
                            dlclose(handle);
                            return;
                        }
                    #endif
                    
                    plugins[plugin_raw->getInternalName()] = std::unique_ptr<Plugin>(plugin_raw);
                    
                    logger->info("[plugins] Loaded plugin: " + plugin_raw->getName() + " v" + 
                                plugin_raw->getVersion() + " from " + path.string());
                    
                } catch (const std::exception& e) {
                    logger->error("[plugins] Exception loading plugin " + path.string() + ": " + e.what());
                }
            };
            bool unloadPlugin(const std::string& name) {
                auto it = plugins.find(name);
                if (it != plugins.end()) {
                    plugins.erase(it);
                    logger->info("[plugins] Unloaded plugin: " + name);
                    return true;
                }
                logger->warn("[plugins] Plugin not found for unloading: " + name);
                return false;
            };
        public:
            PluginManager(
                std::shared_ptr<ILogger> logger
            ) : logger(logger) {
                this->plugins.clear();
                const std::filesystem::path plugin_path = Locate::currentDirectory() / "plugins";
                if (!std::filesystem::exists(plugin_path)) {
                    logger->warn("[plugins] Plugin directory not found: " + plugin_path.string());
                    return;
                }
                for (const auto& entry : std::filesystem::directory_iterator(plugin_path)) {
                    if (entry.is_regular_file()) {
                        const auto& path = entry.path();
                        const auto extension = path.extension().string();
                        #ifdef _WIN32
                            if (extension == ".dll") {
                                loadPlugin(path.string());
                            }
                        #elif __APPLE__
                            if (extension == ".dylib") {
                                loadPlugin(path.string());
                            }
                        #else
                            if (extension == ".so") {
                                loadPlugin(path.string());
                            }
                        #endif
                    }
                }
            };
            ~PluginManager() = default;

            PluginManager(const PluginManager&) = delete;
            PluginManager& operator=(const PluginManager&) = delete;

            const std::map<std::string, std::unique_ptr<Plugin>>& getPlugins() const {
                return plugins;
            };
            json::array getPluginList() const {
                json::array list;
                for (const auto& [name, plugin] : plugins) {
                    list.push_back(plugin->getMetadata());
                }
                return list;
            };
    };
}