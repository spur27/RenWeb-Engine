#pragma once

#include "../interfaces/Isignal_manager.hpp"
#include "../interfaces/Ilogger.hpp"
#include <boost/asio.hpp>
#include <map>
#include <functional>
#include <thread>
#include <csignal>

namespace RenWeb {    
    class SignalManager : public RenWeb::ISignalManager {
        private:
            std::shared_ptr<RenWeb::ILogger> logger;
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
                        if (error) {
                            if (error == boost::asio::error::operation_aborted) {
                                this->logger->trace("[signal] Signal wait canceled (refreshing signal set)");
                            } else {
                                this->logger->error("[signal] Signal handler error: " + std::string(error.message()));
                            }
                            return;
                        }
                        this->logger->debug("[signal] Signal " + std::to_string(signal) + " triggered.");
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
            SignalManager(std::shared_ptr<ILogger> logger,std::map<int, std::function<void(int)>> required_signal_callbacks = {}) 
                : logger(logger)
                , io_context()
                , signals(this->io_context)
                , signal_callbacks()
                , required_signal_callbacks(required_signal_callbacks)
                , is_running(true)
            {
                this->refreshSignals();

                this->io_context_thread = std::thread([this](){
                    this->logger->trace("[signal] Starting signal handler thread...");
                    this->io_context.run();
                    this->logger->trace("[signal] Exiting signal handler thread...");
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

                this->logger->trace("[signal] Deconstructing SignalManager");
            }
            ISignalManager* add(int signal_num, std::function<void(int)> callback) override {
                this->signal_callbacks[signal_num] = callback;
                this->refreshSignals();
                this->logger->trace("[signal] Registered signal handler for signal " + std::to_string(signal_num));
                return this;
            }
            ISignalManager* remove(int signal_num) override {
                if (this->signal_callbacks.find(signal_num) != this->signal_callbacks.end()) {
                    this->signal_callbacks.erase(signal_num);
                    this->refreshSignals();
                    this->logger->trace("[signal] Removed signal handler for signal " + std::to_string(signal_num));
                }
                return this;
            }
            bool has(int signal_num) override {
                return this->signal_callbacks.find(signal_num) != this->signal_callbacks.end();
            }
            ISignalManager* clear() override {
                this->signal_callbacks.clear();
                this->signals.cancel();
                this->signals.clear();
                this->logger->trace("[signal] Cleared all signal handlers");
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
