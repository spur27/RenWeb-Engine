#include "../include/process_manager.hpp"

#include "logger.hpp"
#include "file.hpp"
#include <string>

using PM = RenWeb::ProcessManager;
using File = RenWeb::File;

PM::ProcessManager() {
    // this->main_web_page.reset(new RenWeb::Webview(this->info->getAppName()));
    Log::trace("Process Manager object constructed.");
}

PM::~ProcessManager() {
    // Takedown logger (shouldn't have to do anything)
    // Setup cache, config, custom, html
    // delete this->main_window;
    this->killProcesses();
    Log::trace("Process Manager object deconstructed.");
}

void PM::startProcess(std::string web_page_name) {
    if (this->sub_processes.find(web_page_name) == this->sub_processes.cend()) {
        this->sub_processes.insert(std::make_pair(web_page_name, std::vector<boost::process::child>()));
    }
    this->sub_processes[web_page_name].push_back(boost::process::child(File::getPath().string(), "-P", web_page_name, "-l", std::to_string(Log::log_level), boost::process::std_out > stdout, boost::process::std_err > stderr, boost::process::std_in < stdin));
    //DEBUG
    this->printProcesses();
}

int PM::cleanProcesses() {
    int removed_process_count = 0;
    for (auto& [web_page_name, vector_v] : this->sub_processes) {
        this->sub_processes[web_page_name].erase(std::remove_if(vector_v.begin(), vector_v.end(), [&removed_process_count](boost::process::child& proc) -> bool {
            const bool process_status = !proc.running();
            if (process_status) {
                Log::info("Removing process...");
                removed_process_count++;
            }
            return process_status;
        }));
    }
    for (auto iter = this->sub_processes.begin(); iter != this->sub_processes.end();) {
        if (iter->second.empty()) {
            Log::info("Process vector for \"" + iter->first + "\" is empty. Deleting from map...");
            iter = this->sub_processes.erase(iter);
        } else {
            iter++;
        }
    }
    return removed_process_count;
}


void PM::printProcesses() {
    std::stringstream result("###Processes###\n");
    for (auto& [web_page_name, vector_v] : this->sub_processes) {
        if (vector_v.empty()) {
            result << "\t" << web_page_name + ": EMPTY\n";
            continue;
        }
        for (size_t i = 0; i < vector_v.size(); i++) {
            const std::string status = [](const bool& status_v) -> std::string {
                if (status_v) {
                    return "ACTIVE";
                } else {
                    return "INACTIVE";
                }
            }(vector_v[i].running());
            result << "\t\t[" << std::to_string(i) << "]: " << std::to_string(vector_v[i].id()) << " " << status << "\n";
        }
    }
    Log::info(result.str());
}

void PM::killProcesses() {
    for (auto& [webpage_name, vector_v] : this->sub_processes) {
        for (auto& proc : vector_v) {
            if (proc.running()) {
                Log::info("Killing " + std::to_string(proc.id()) + " of document \"" + webpage_name + "\"");
#if defined(_WIN32)
                Log::critical("killProcesses is UNIMPLEMENTED for windows");
                proc.terminate();
#else
                kill(proc.id(), SIGTERM);
#endif
                proc.join();
            }
        }
    }
    this->sub_processes.clear();
}

bool PM::hasProcess(std::string process_name) {
    if (this->sub_processes.find(process_name) == this->sub_processes.end()) return false;
    for (auto& [proc_name, proc_vec] : this->sub_processes) {
        for (auto& proc : proc_vec) {
            if (proc.running()) return true;
        }
    }
    return false;
}

void PM::bringToForeground(std::string process_name) {
#if defined(__linux__)
    Log::warn("Cannot work on linux as gtk is being used (can't raise windows using wayland). Doing nothing...");
    return;
#endif
    if (this->sub_processes.find(process_name) == this->sub_processes.end()) {
        Log::error("No process of name \"" + process_name + "\" exists! Can't bring to foreground.");
        return;
    }
    std::vector<boost::process::child>& proc_vec = this->sub_processes[process_name]; 
    boost::process::child* proc = nullptr;
    bool multiple_processes = false;
    for (auto& proc_v : proc_vec) {
        if (proc_v.running() && proc == nullptr) {
            proc = &proc_v;
        } else if (proc_v.running() && !multiple_processes) {
            multiple_processes = true;
        }
    }
    if (proc == nullptr) {
        Log::error("No process of name \"" + process_name + "\" exists! Can't bring to foreground.");
        return;
    } else if (multiple_processes) {
        Log::warn("Multiple processes of \"" + process_name + "\" are open. Changing first one found to foreground.");
    }
    // pid_t child_pid = proc->id();
    try {
#if defined(_WIN32)
    struct EnumData {
        DWORD pid;
        HWND hwnd;
    } data { proc->id(), nullptr };
    EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
        EnumData* pData = reinterpret_cast<EnumData*>(lParam);
        DWORD windowPid;
        GetWindowThreadProcessId(hwnd, &windowPid);
        if (windowPid == pData->pid && GetWindow(hwnd, GW_OWNER) == nullptr && IsWindowVisible(hwnd)) {
            pData->hwnd = hwnd;
            return FALSE;
        }
        return TRUE;
    }, reinterpret_cast<LPARAM>(&data));
    if (data.hwnd) {
        ShowWindow(data.hwnd, ((IsIconic(data.hwnd) ? SW_RESTORE : SW_SHOW)));
        SetForegroundWindow(data.hwnd);
    } else {
        Log::error("No window context");
    }
#elif defined(__APPLE__)
    // macOS: Use AppleScript to bring process with PID to front
    // NSString *script = [NSString stringWithFormat:
    //     @"tell application \"System Events\"\n"
    //     "    set frontmost of the first process whose unix id is %d to true\n"
    //     "end tell", child_pid];
    // NSAppleScript* appleScript = [[NSAppleScript alloc] initWithSource:script];
    // NSDictionary* errorInfo = nil;
    // [appleScript executeAndReturnError:&errorInfo];
    // [appleScript release];
    Log::critical("bringToForefround is UNIMPLEMENTED");
#endif
    } catch (const std::exception& e) {
        Log::error(e.what());
    }
}