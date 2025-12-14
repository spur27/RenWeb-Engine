#pragma once

#include "daemon_manager.hpp"

namespace RenWeb {
    template <typename Key>
    class ProcessManager : public DaemonManager<Key> {
        public:
            ProcessManager() : DaemonManager<Key>() {};
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
