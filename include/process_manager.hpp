#pragma once

// #include <boost/process.hpp>
#include <map>
#include <string>
#include <vector>
#include <boost/process.hpp>


namespace RenWeb {
    class ProcessManager {
        private:
            std::map<std::string, std::vector<boost::process::child>> sub_processes;
        public:
            ProcessManager();
            ~ProcessManager();
            void startProcess(std::string);
            int cleanProcesses();
            void printProcesses();
            void killProcesses();
            bool hasProcess(std::string);
            void bringToForeground(std::string);
    };
};
