#include "../include/window_helpers.hpp"

// #include <boost/regex.hpp>
#include "logger.hpp"
#include <regex>

namespace WH = RenWeb::WindowHelpers;

std::string WH::strToJsonStr(std::string str) {
    return std::string('"' + str + '"');
}

// Removes the surrounding quotes from a JSON dumped string
std::string WH::jsonStrToStr(std::string str) {
    return str.substr(1, str.length()-2);
} 

// Gets JSON contents as a usable std::string
std::string WH::jsonToStr(json json_v, int indent) {
    std::string json_str = json_v.dump(indent);
    if (json_v.is_string()) {
        json_str = WH::jsonStrToStr(json_str);
    }
    return json_str;
}

std::vector<char> WH::jsonUint8arrToVec(json json_v) {
    try {
        if (!json_v.is_object() && !json_v.is_array()) {
            throw std::runtime_error(std::string("Variable passed isn't a uint8array and can't be converted to one! A ") + json_v.type_name() + " was recieved.");
        }
        size_t n = json_v.size();
        std::vector<char> buffer(n);
        for (const auto& [key, value] : json_v.items()) {
            size_t index = static_cast<size_t>(std::stoul(key));
            if (index >= n) continue; // Safety check in case of malformed data
            int val = json_v.value(key, -1);
            if (val == -1) {
                throw std::runtime_error("Invalid value in binary string: " + WH::jsonToStr(value));
            }
            buffer[index] = static_cast<char>(val);
        }
        return buffer;
    } catch (const std::exception& e) {
        Log::error(e.what());
        return std::vector<char>();
    }
}

std::vector<unsigned int> WH::strToUint8arrVec(std::string str) {
    return std::vector<unsigned int>{str.begin(), str.end()};
}

std::string WH::jsonUint8arrToString(json json_v) {
    std::vector<char> vec = WH::jsonUint8arrToVec(json_v);
    if (vec.empty()) return "";
    else return std::string{vec.begin(), vec.end()};
}

std::string WH::formatPath(std::string path) {
    if (WH::isURI(path)) {
        return path;
    }
#if defined(_WIN32)
    // this->hide();
    for (size_t i = 0; i < path.length(); i++) {
        if (path[i] == '/') path[i] = '\\';
    }
    return path;
#else 
    for (size_t i = 0; i < path.length(); i++) {
        if (path[i] == '\\') path[i] = '/';
    }
    return path;
#endif
}

bool WH::isURI(std::string maybe_uri) {
    // b((?:https?|ftp|file)://[-a-zA-Z0-9+&@#/%?=~_|!:, .;]*[-a-zA-Z0-9+&@#/%=~_|])
    const std::regex url_regex(
        "^(http://|https://|file://).*",
        std::regex::icase);
    return std::regex_match(maybe_uri, url_regex);
}
