#pragma once

#include <boost/json.hpp>
#include <csignal>

namespace json = boost::json;

typedef int32_t Pid;

namespace RenWeb {
    class IProcessManager {
        public:
            virtual ~IProcessManager() = 0;
            virtual json::object dumpProcess(Pid pid) const = 0;
            virtual json::object dumpCurrentProcess() const = 0;
            virtual json::array dumpSystemProcesses() const = 0;
            virtual json::array dumpRenWebProcesses() const = 0;
            virtual json::array dumpChildProcesses() const = 0;
            virtual json::object createSystemProcess(
                const std::vector<std::string>& args, 
                bool is_detachable = false,
                bool share_stdio = false
            ) = 0;
            virtual json::object createRenWebProcess(
                const std::vector<std::string>& pages, 
                std::vector<std::string> args = {},
                bool is_detachable = false,
                bool include_current_args = true,
                bool share_stdio = false
            ) = 0;
            virtual Pid getPid() const = 0;
            virtual void kill(Pid pid, int32_t signal = SIGINT) = 0;
            virtual void detach(Pid pid) = 0;
            virtual void send(Pid pid, const json::value& message) = 0;
            virtual std::vector<std::string> listen(Pid pid, int64_t lines = INT64_MAX, bool truncate = false) const = 0;
            virtual void wait(Pid pid) = 0;
            virtual void waitAll() = 0;
            virtual void registerProcess() const = 0;
    };    
    inline IProcessManager::~IProcessManager() = default;
}