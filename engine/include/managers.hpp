#pragma once

#include <map>
#include <functional>
#include <stdexcept>

namespace RenWeb {
    template <typename Key, typename... Args>
    class CallbackManager {
        private: 
            std::map<Key, std::function<void(Args...)>> callbacks;
        public:
            CallbackManager() { };
            ~CallbackManager() { this->clear(); };
            CallbackManager* add(const Key& key, std::function<void(Args...)> callback) {
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
            bool run(const Key& key, Args... args) {
                auto callback = this->callbacks.find(key);
                if (callback != this->callbacks.end()) {
                    callback->second(args...);
                    return true;
                }
                return false;
            }
            bool runAll(Args... args) {
                for (const auto& map_pair : this->callbacks) {
                    map_pair->second(args...);
                }
                return true;
            }
            const std::map<Key, std::function<void(Args...)>>& getMap() {
                return this->callbacks;
            }
    };
// -----------------------------------------------
// -----------------------------------------------
// -----------------------------------------------
    template <typename Key, typename GetType, typename... SetType>
    class GetSetManager {
        private: 
            std::map<Key, std::pair<std::function<GetType()>, std::function<void(SetType...)>>> getsets;
        public:
            GetSetManager() { };
            ~GetSetManager() { this->clear(); };
            GetSetManager* add(const Key& key, std::pair<std::function<GetType()>, std::function<void(SetType...)>> get_set_pair) {
                this->getsets[key] = get_set_pair;
                return this;
            }
            GetSetManager* remove(const Key& key) {
                if (this->getsets.find(key) != this->getsets.end()) {
                    this->getsets[key].clear();
                }
                return this;
            }
            void clear() {
                this->getsets.clear();
            }
            GetType get(const Key& key) {
                auto getset = this->getsets.find(key);
                if (getset != this->getsets.end()) {
                    return getset->second.first();
                } else {
                    throw std::runtime_error("No getter found for key " + key);
                }
            }
            void set(const Key& key, SetType... args) {
                auto getset = this->getsets.find(key);
                if (getset != this->getsets.end()) {
                    getset->second.second(args...);
                } else {
                    throw std::runtime_error("No setter found for key " + key);
                }
            }
            const std::map<Key, std::pair<std::function<GetType()>, std::function<void(SetType...)>>>& getMap() {
                return this->getsets;
            }
    };
};
