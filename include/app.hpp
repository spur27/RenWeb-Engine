#pragma once

#include "interfaces/Iprocess_manager.hpp"
#include "interfaces/Ilogger.hpp"
#include "interfaces/Iweb_server.hpp"
#include "interfaces/Iwebview.hpp"
#include "json.hpp"
#include "config.hpp"
#include "managers/plugin_manager.hpp"
#include "window_functions.hpp"
#include <map>
#include <string>
#include <memory>

namespace RenWeb {
    class AppBuilder;
    class App {
        private:
          std::shared_ptr<ILogger> logger = nullptr;
          App(std::shared_ptr<ILogger> logger) : logger(logger) {}
          
        public:
          ~App() = default;
          
          std::vector<std::string> orig_args;
          std::unique_ptr<JSON> info = nullptr;
          std::unique_ptr<Config> config = nullptr;
          std::unique_ptr<RenWeb::IProcessManager> procm = nullptr;
          std::unique_ptr<RenWeb::IWebview> w = nullptr;
          std::unique_ptr<RenWeb::IWebServer> ws = nullptr;
          std::unique_ptr<RenWeb::WindowFunctions> fns = nullptr;
          std::unique_ptr<RenWeb::PluginManager> pm = nullptr;
          
          void run();
          
        friend class AppBuilder;
    };
    class AppBuilder {
      private:
          const std::map<std::string, std::string>& opts;
          int argc;
          char** argv;

          std::shared_ptr<ILogger> logger = nullptr;
          std::unique_ptr<JSON> info = nullptr;
          std::unique_ptr<Config> config = nullptr;
          std::unique_ptr<RenWeb::IProcessManager> procm = nullptr;
          std::unique_ptr<RenWeb::IWebview> w = nullptr;
          std::unique_ptr<RenWeb::IWebServer> ws = nullptr;
          std::unique_ptr<RenWeb::WindowFunctions> fns = nullptr;
          std::unique_ptr<RenWeb::PluginManager> pm = nullptr;

          void validateOpt(const std::string& opt);
      public:
          AppBuilder(const std::map<std::string, std::string>& opts, int argc, char** argv);

          AppBuilder& withLogger(std::shared_ptr<ILogger> logger);
          AppBuilder& withInfo(std::unique_ptr<JSON> info);
          AppBuilder& withConfig(std::unique_ptr<Config> config);
          AppBuilder& withProcessManager(std::unique_ptr<RenWeb::IProcessManager> procm);
          AppBuilder& withWebview(std::unique_ptr<RenWeb::IWebview> w);
          AppBuilder& withWebServer(std::unique_ptr<RenWeb::IWebServer> ws);
          AppBuilder& withWindowFunctions(std::unique_ptr<RenWeb::WindowFunctions> fns);
          AppBuilder& withPluginManager(std::unique_ptr<RenWeb::PluginManager> pm);

          std::unique_ptr<App> build();
    };
}
