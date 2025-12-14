#pragma once

#include <vector>
#include <string>


namespace RenWeb {
    template <typename Key>
    class IRoutineManager {
        public:
            virtual int add(const Key& key, const std::vector<std::string>& args) = 0;
            virtual bool hasPID(const int& pid) = 0;
            virtual bool has(const Key& key) = 0;
            virtual int hasRunning(const Key& key) = 0;
            virtual void kill(const Key& key) = 0;
            virtual void waitPID(const int& pid) = 0;
            virtual void wait(const Key& key) = 0;
            virtual void waitAll() = 0;
    };
};
