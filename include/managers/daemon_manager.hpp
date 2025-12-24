#pragma once

// #include <boost/process.hpp>
#include <map>
#include <string>
#include <boost/process.hpp>
#include "interfaces/Ilogger.hpp"
#include "interfaces/Iroutine_manager.hpp"

using child = boost::process::child;

namespace RenWeb {
    template <typename Key>
    class DaemonManager : public IRoutineManager<Key> {
        private:
            std::map<int, child*> processes_by_pid;
        protected:
            std::shared_ptr<ILogger> logger;
            std::map<Key, std::vector<child>> processes;            
        public:
            DaemonManager(std::shared_ptr<ILogger> logger) : logger(logger) { };
            ~DaemonManager() { 
                for (auto& [_, proc_vec] : this->processes) {
                    for (auto& proc : proc_vec) {
                        if (proc.running()) {
                            proc.detach();
                        }
                    }
                }
            };
            int add(const Key& key, const std::vector<std::string>& args) {
                if (!this->has(key)) {
                    this->processes[key] = std::vector<child>();
                }
                this->processes[key].push_back(
                    child(
                        args, 
                        boost::process::std_out > stdout, 
                        boost::process::std_err > stderr, 
                        boost::process::std_in < stdin)
                );
                int pid = this->processes[key].back().id();
                this->processes_by_pid[pid] = &this->processes[key].back();
                this->logger->info("[proc] Added process at PID " + std::to_string(pid));
                return pid;
            };
            bool hasPID(const int& pid) {
                return this->processes_by_pid.find(pid) != this->processes_by_pid.cend() || this->processes_by_pid[pid]->running();
            }
            bool has(const Key& key) {
                if (this->processes.find(key) == this->processes.cend()) {
                    return false;
                }
                bool any_running = false;
                for (auto& proc : this->processes[key]) {
                    any_running |= proc.running();
                }
                return any_running;
            }
            int hasRunning(const Key& key) {
                if (!this->has(key)) {
                    return 0;
                }
                int count = 0;
                for (auto& proc : this->processes[key]) {
                    if (proc.running()) {
                        count++;
                    }
                }
                return count;
            }
            void kill(const Key& key) {
                if (!this->has(key)) {
                    return;
                }
                for (auto& proc : this->processes[key]) {
                    if (!proc.running()) continue;
                    int id = proc.id();

                    #if defined(_WIN32)
                        Log::critical("killProcesses is UNIMPLEMENTED for windows");
                        proc.terminate();
                    #else
                        ::kill(id, SIGINT);
                    #endif
                        proc.join();
                        this->processes_by_pid.erase(id);
                        this->logger->info("[proc] Killed process at PID " + std::to_string(id));
                }
                this->processes.erase(key);
            };
            void waitPID(const int& pid) {
                if (!this->hasPID(pid)) {
                    return;
                }
                this->processes_by_pid.at(pid)->wait();
                this->processes_by_pid.erase(pid);
            }
            void wait(const Key& key) {
                if (!this->has(key)) {
                    return;
                }
                for (auto& proc : this->processes[key]) {
                    this->waitPID(proc.id());
                }
                this->processes.erase(key);
            }
            void waitAll() {
                for (const auto& [key, val] : this->processes) {
                    this->wait(key);
                }
            }
    };
};
