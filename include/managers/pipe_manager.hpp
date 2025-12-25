#pragma once

// #include <boost/process.hpp>
#include "../interfaces/Ilogger.hpp"
#include "../interfaces/Iroutine_manager.hpp"
#include <boost/process/io.hpp>
#include <map>
#include <memory>
#include <string>
#include <boost/process.hpp>
#include <utility>

using child = boost::process::child;
using ipstream = boost::process::ipstream;
using group = boost::process::group;

namespace RenWeb {
    struct ipstreams {
        ipstream out;
        ipstream err;
    };
    template <typename Key>
    class PipeManager : public IRoutineManager<Key> {
        private:
            std::shared_ptr<ILogger> logger;
            std::map<int, std::pair<struct ipstreams, child>*> pipes_by_pid;
            std::map<Key, std::pair<struct ipstreams, child>> pipes;
        public:
            PipeManager(std::shared_ptr<ILogger> logger) : logger(logger) { };
            ~PipeManager() {
                for (auto& proc : this->pipes) {
                    if (proc.second.second.running()) {
                        this->kill(proc.first);
                    }
                }
                this->pipes.clear();
            };
            int add(const Key& key, const std::vector<std::string>& args) {
                if (this->pipes.find(key) != this->pipes.cend()) {
                    this->kill(key);
                }
                auto pair = std::pair<struct ipstreams, child>();
                pair.second = child(
                    args,
                    boost::process::std_out > pair.first.out, 
                    boost::process::std_err > pair.first.err
                );
                this->pipes.insert(
                    std::make_pair(key, std::move(pair))
                );
                int pid = this->pipes[key].second.id();
                this->pipes_by_pid[pid] = &this->pipes[key];
                this->logger->info("[pipe] Added process pipe at PID " + std::to_string(pid));
                return pid;
            };
            bool hasPID(const int& pid) {
                return this->pipes_by_pid.find(pid) != this->pipes_by_pid.cend();
            }
            bool has(const Key& key) {
                return this->pipes.find(key) != this->pipes.cend();
            }
            int hasRunning(const Key& key) {
                if (!this->has(key) || !this->pipes[key].second.running()) {
                    return 0;
                } else {
                    return 1;
                }
            }
            const ipstreams* getPID(const int& pid) {
                if (this->hasPID(pid)) {
                    return &this->pipes_by_pid[pid]->first;
                }
                return nullptr;
            }
            const ipstreams* get(const Key& key) {
                if (this->has(key)) {
                    return &this->pipes[key].first;
                }
                return nullptr;
            }
            void kill(const Key& key) {
                if (this->pipes.find(key) == this->pipes.cend()) {
                    return;
                }
                int id = this->pipes[key].second.id();
                #if defined(_WIN32)
                    this->logger->critical("killProcesses is UNIMPLEMENTED for windows");
                    this->pipes[key].second.terminate();
                #else
                    ::kill(id, SIGINT);
                #endif
                    this->pipes[key].second.join();
                    this->pipes.erase(key);
                    this->pipes_by_pid.erase(id);
                    this->logger->info("[pipe] Killed process pipe at PID " + std::to_string(id));
            };
            void waitPID(const int& pid) {
                if (!this->hasPID(pid)) {
                    return;
                }
                this->pipes_by_pid[pid]->second.wait();
            }
            void wait(const Key& key) {
                if (this->pipes.find(key) == this->pipes.cend()) {
                    return;
                }
                this->pipes[key].second.wait();
            }
            void waitAll() {
                for (const auto& [key, val] : this->pipes) {
                    this->wait(key);
                }
            }
    };
};