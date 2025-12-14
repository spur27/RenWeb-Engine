#pragma once

#include <map>
#include <functional>
#include <stdexcept>

namespace RenWeb {
    template <typename Key, typename OutType, typename... InTypes>
    class InOutManager {
        private: 
            std::map<Key, std::pair<std::function<OutType()>, std::function<void(InTypes...)>>> inouts;
        public:
            InOutManager() { };
            ~InOutManager() { this->clear(); };
            InOutManager* add(const Key& key, std::pair<std::function<OutType()>, std::function<void(InTypes...)>> up_down_pair) {
                this->inouts[key] = up_down_pair;
                return this;
            }
            InOutManager* remove(const Key& key) {
                if (this->inouts.find(key) != this->inouts.end()) {
                    this->inouts[key].first = nullptr;
                }
                return this;
            }
            InOutManager* clear() {
                this->inouts.clear();
                return this;
            }
            OutType out(const Key& key) {
                auto inout = this->inouts.find(key);
                if (inout != this->inouts.end()) {
                    return inout->second.first();
                } else {
                    throw std::runtime_error("No out-lambda found for key " + key);
                }
            }
            void in(const Key& key, InTypes... args) {
                auto inout = this->inouts.find(key);
                if (inout != this->inouts.end()) {
                    inout->second.second(args...);
                } else {
                    throw std::runtime_error("No in-lambda found for key " + key);
                }
            }
            const std::map<Key, std::pair<std::function<OutType()>, std::function<void(InTypes...)>>>& getMap() {
                return this->inouts;
            }
    };
};
