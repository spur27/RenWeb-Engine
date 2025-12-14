#pragma once

#include <map>
#include <functional>
#include <stdexcept>

namespace RenWeb {
    template <typename Key, typename RetType, typename... ParamTypes>
    class CallbackManager {
        private: 
            std::map<Key, std::function<RetType(ParamTypes...)>> callbacks;
        public:
            CallbackManager() { };
            ~CallbackManager() { this->clear(); };
            CallbackManager* add(const Key& key, std::function<RetType(ParamTypes...)> callback) {
                this->callbacks[key] = callback;
                return this;
            }
            CallbackManager* remove(const Key& key) {
                if (this->callbacks.find(key) != this->callbacks.end()) {
                    this->callbacks[key].clear();
                }
                return this;
            }
            void clear() {
                this->callbacks.clear();
            }
            RetType run(const Key& key, ParamTypes... args) {
                auto callback = this->callbacks.find(key);
                if (callback != this->callbacks.end()) {
                    return callback->second(args...);
                }
                throw std::runtime_error("No lambda found for key " + key);
            }
            const std::map<Key, std::function<RetType(ParamTypes...)>>& getMap() {
                return this->callbacks;
            }
    };
};
