#pragma once

#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace RenWeb {
    namespace WindowHelpers {
            std::string strToJsonStr(std::string);
            std::string jsonStrToStr(std::string);
            std::string jsonToStr(json, int=-1);
            std::vector<char> jsonUint8arrToVec(json);
            std::vector<unsigned int> strToUint8arrVec(std::string);
            std::string jsonUint8arrToString(json);
            std::string formatPath(std::string);
            bool isURI(std::string);
    }
};
