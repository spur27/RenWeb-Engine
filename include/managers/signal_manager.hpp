#pragma once

#include "../interfaces/Isignal_manager.hpp"
#include "app.hpp"
#include <boost/asio.hpp>
#include <map>
#include <functional>
#include <thread>
#include <csignal>

namespace RenWeb {    
    class SignalManager : public RenWeb::ISignalManager {
        private:
            RenWeb::App* app;
            boost::asio::io_context io_context;
            boost::asio::signal_set signals;
            std::thread io_context_thread;
            std::map<int, std::function<void(int)>> signal_callbacks;
            const std::map<int, std::function<void(int)>> required_signal_callbacks;
            bool is_running;

            void refreshSignals() {
                this->signals.cancel();
                this->signals.clear();

                for (const auto& [signal_num, _] : this->signal_callbacks) {
                    this->signals.add(signal_num);
                }
                for (const auto& [signal_num, _] : this->required_signal_callbacks) {
                    if (this->signal_callbacks.find(signal_num) == this->signal_callbacks.end()) {
                        this->signals.add(signal_num);
                    }
                }
                
                if ((!this->signal_callbacks.empty() || !this->required_signal_callbacks.empty()) && this->is_running) {
                    this->signals.async_wait([this](const boost::system::error_code& error, int signal){
                        (this->app->logger) ? this->app->logger->debug("Signal " + std::to_string(signal) + " triggered.") : void();
                        if (error) {
                            (this->app->logger) ? this->app->logger->error("Signal handler error: " + std::string(error.message())) : void();
                            return;
                        }                        
                        if (this->signal_callbacks.find(signal) != this->signal_callbacks.end()) {
                            this->signal_callbacks[signal](signal);
                        }
                        if (this->required_signal_callbacks.find(signal) != this->required_signal_callbacks.end()) {
                            this->required_signal_callbacks.at(signal)(signal);
                        }
                        if (this->is_running) {
                            this->refreshSignals();
                        }
                    });
                }
            }

        public:
            SignalManager(RenWeb::App* app) 
                : app(app)
                , io_context()
                , signals(this->io_context)
                , signal_callbacks()
                , required_signal_callbacks({
                    {SIGINT, [this](int signal) {
                        (void)signal;
                        this->app->w->terminate();
                    }}, {SIGTERM, [this](int signal) {
                        (void)signal;
                        this->trigger(SIGINT);
                    }}, {SIGABRT, [this](int signal) {
                        (void)signal;
                        this->trigger(SIGINT);
                    }}
                })
                , is_running(true)
            {
                this->refreshSignals();

                this->io_context_thread = std::thread([this](){
                    if (this->app->logger) {
                        this->app->logger->trace("Starting signal handler thread...");
                    }
                    this->io_context.run();
                    if (this->app->logger) {
                        this->app->logger->trace("Exiting signal handler thread...");
                    }
                });
            }

            ~SignalManager() {
                this->is_running = false;
                this->signals.cancel();
                this->signals.clear();
                this->io_context.stop();
                
                if (this->io_context_thread.joinable()) {
                    this->io_context_thread.join();
                }
                
                if (this->app->logger) {
                    this->app->logger->trace("Deconstructing SignalManager");
                }
            }
            ISignalManager* add(int signal_num, std::function<void(int)> callback) override {
                this->signal_callbacks[signal_num] = callback;
                this->refreshSignals();
                this->app->logger->trace("Registered signal handler for signal " + std::to_string(signal_num));
                return this;
            }
            ISignalManager* remove(int signal_num) override {
                if (this->signal_callbacks.find(signal_num) != this->signal_callbacks.end()) {
                    this->signal_callbacks.erase(signal_num);
                    this->refreshSignals();
                    this->app->logger->trace("Removed signal handler for signal " + std::to_string(signal_num));
                }
                return this;
            }
            /**
             * Check if a signal handler is registered
             * @param signal_num The signal number to check
             * @return true if handler exists, false otherwise
             */
            bool has(int signal_num) override {
                return this->signal_callbacks.find(signal_num) != this->signal_callbacks.end();
            }
            ISignalManager* clear() override {
                this->signal_callbacks.clear();
                this->signals.cancel();
                this->signals.clear();
                this->app->logger->trace("Cleared all signal handlers");
                return this;
            }
            size_t count() override {
                return this->signal_callbacks.size();
            }
            void trigger(int signal_num) override {
                if (this->signal_callbacks.find(signal_num) != this->signal_callbacks.end()) {
                    this->signal_callbacks[signal_num](signal_num);
                }
                if (this->required_signal_callbacks.find(signal_num) != this->required_signal_callbacks.end()) {
                    this->required_signal_callbacks.at(signal_num)(signal_num);
                }
            }
    };
}
