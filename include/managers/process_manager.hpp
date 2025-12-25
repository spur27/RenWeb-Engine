#pragma once

#include "daemon_manager.hpp"
#include <memory>

namespace RenWeb {
    template <typename Key>
    class ProcessManager : public DaemonManager<Key> {
        public:
            ProcessManager(std::shared_ptr<ILogger> logger) : DaemonManager<Key>(logger) {};
            ~ProcessManager() {
                for (const auto& [key, _] : this->processes) {
                    if (this->hasRunning(key)) {
                        this->kill(key);
                    }
                }
                this->processes.clear();
            };
    };
};
