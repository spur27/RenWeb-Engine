#pragma once

#include <functional>

namespace RenWeb {
    class ISignalManager {
        public:
            virtual ~ISignalManager() = default;
            virtual ISignalManager* add(int signal_num, std::function<void(int)> callback) = 0;
            virtual ISignalManager* remove(int signal_num) = 0;
            virtual bool has(int signal_num) = 0;
            virtual ISignalManager* clear() = 0;
            virtual size_t count() = 0;
            virtual void trigger(int signal_num) = 0;
    };
}