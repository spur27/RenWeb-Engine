#include "../include/app.hpp"

#include "../include/web_server.hpp"
#include "../include/webview.hpp"
#include "../include/locate.hpp"
#include "../include/logger.hpp"
#include "../include/managers/process_manager.hpp"
#include "../include/managers/daemon_manager.hpp"
#include "../include/managers/pipe_manager.hpp"
#include "../include/managers/signal_manager.hpp"
#include "../include/info.hpp"
#include <boost/json/object.hpp>
#include <boost/json/value.hpp>

using namespace RenWeb;
using JSON = RenWeb::JSON;

void AppBuilder::validateOpt(const std::string& opt) {
    if (this->opts.find(opt) == this->opts.end()) {
        throw std::runtime_error("[app builder] Option '" + opt + "' missing in opts!");
    }
}

AppBuilder::AppBuilder(
    const std::map<std::string, std::string>& opts, 
    int argc, 
    char** argv)
    : opts(opts), argc(argc), argv(argv)
{ }

AppBuilder* AppBuilder::withLogger(std::shared_ptr<ILogger> logger) {
    this->logger = logger;
    return this;
}

AppBuilder* AppBuilder::withInfo(std::unique_ptr<JSON> info) {
    this->info = std::move(info);
    return this;
}

AppBuilder* AppBuilder::withConfig(std::unique_ptr<Config> config) {
    this->config = std::move(config);
    return this;
}

AppBuilder* AppBuilder::withProcessManager(std::unique_ptr<IRoutineManager<std::string>> procm) {
    this->procm = std::move(procm);
    return this;
}

AppBuilder* AppBuilder::withDaemonManager(std::unique_ptr<IRoutineManager<std::string>> daem) {
    this->daem = std::move(daem);
    return this;
}

AppBuilder* AppBuilder::withPipeManager(std::unique_ptr<IRoutineManager<std::string>> pipem) {
    this->pipem = std::move(pipem);
    return this;
}

AppBuilder* AppBuilder::withSignalManager(std::unique_ptr<ISignalManager> signalm) {
    this->signalm = std::move(signalm);
    return this;
}

AppBuilder* AppBuilder::withWebview(std::unique_ptr<IWebview> w) {
    this->w = std::move(w);
    return this;
}

AppBuilder* AppBuilder::withWebServer(std::unique_ptr<IWebServer> ws) {
    this->ws = std::move(ws);
    return this;
}

AppBuilder* AppBuilder::withWindowFunctions(std::unique_ptr<WindowFunctions> fns) {
    this->fns = std::move(fns);
    return this;
}

std::unique_ptr<App> AppBuilder::build() {      
    if (this->logger == nullptr) {      
        this->withLogger(std::make_unique<Logger>(std::make_unique<LogFlags>(LogFlags{
            .log_silent = opts.at("log_silent") == "true",
            .log_level = static_cast<spdlog::level::level_enum>(std::atoi(opts.at("log_level").c_str())),
            .log_clear = opts.at("log_clear") == "true"
        })));
        this->validateOpt("page");
        this->logger->refresh({
            {"page", opts.at("page")}
        });
    }

    auto app = std::unique_ptr<App>(new App(this->logger));
    app->orig_args = (argc == 0)
        ? std::vector<std::string>({Locate::executable().string()})
        : std::vector<std::string>(this->argv, this->argv + this->argc);
        
    if (this->info == nullptr) {
        this->withInfo(std::make_unique<JSON>(
            this->logger, 
            Info::getInfoFile())
        );
    }
    app->info = std::move(this->info);
    
    if (this->config == nullptr) {
        this->validateOpt("page");
        this->withConfig(std::make_unique<Config>(
            this->logger,
            opts.at("page")
        ));
    }
    app->config = std::move(this->config);

    if (this->procm == nullptr) {
        this->withProcessManager(std::make_unique<ProcessManager<std::string>>(this->logger));
    }
    app->procm = std::move(this->procm);
    
    if (this->daem == nullptr) {
        this->withDaemonManager(std::make_unique<DaemonManager<std::string>>(this->logger));
    }
    app->daem = std::move(this->daem);
    
    if (this->pipem == nullptr) {
        this->withPipeManager(std::make_unique<PipeManager<std::string>>(this->logger));
    }
    app->pipem = std::move(this->pipem);

    if (this->w == nullptr) {
        this->withWebview(std::make_unique<RenWeb::Webview>(false, nullptr));
    }
    app->w = std::move(this->w);
    this->logger->critical("#####WINDOW CREATED");
    // std::this_thread::sleep_for(std::chrono::milliseconds(5000));

    if (this->signalm == nullptr) {
        this->withSignalManager(std::make_unique<SignalManager>(
            this->logger,
            std::map<int, std::function<void(int)>>{
                {SIGINT, [&app](int signal) {
                    (void)signal;
                    if (app && app->w)
                        app->w->terminate();
                }}, {SIGTERM, [&app](int signal) {
                    (void)signal;
                    if (app && app->signalm)
                        app->signalm->trigger(SIGINT);
                }}, {SIGABRT, [&app](int signal) {
                    (void)signal;
                    if (app && app->signalm)
                        app->signalm->trigger(SIGINT);
                }}
            }
        ));
    }
    app->signalm = std::move(this->signalm);

    if (this->ws == nullptr) {
        this->withWebServer(std::make_unique<WebServer>(
            this->logger,
            app.get()
        ));
    }
    app->ws = std::move(this->ws);

    if (this->fns == nullptr) {
        this->withWindowFunctions(std::make_unique<WindowFunctions>(this->logger, app.get()));
    }
    app->fns = std::move(this->fns);

    return app;
}

// ============================================================================
// App Implementation
// ============================================================================



void App::run() {
    const json::object current_state = this->config->getJson().is_object() 
        ? this->config->getJson().as_object() : json::object{};

    this->ws->start();
    this->fns->setup();

    this->w->dispatch([this, current_state](){
        this->fns->setup();
        this->fns->setState(current_state);
    });

    this->fns->window_callbacks->run("navigate_page", json::value(this->config->current_page));
    this->w->run();
    this->fns->teardown();
}