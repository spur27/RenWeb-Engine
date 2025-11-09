#include "../include/window.hpp"

#include <chrono>
#include <memory>
#include <boost/process.hpp>
#include <thread>
#include "boost/process/environment.hpp"
#include "gtk/gtk.h"
#include "process_manager.hpp"
#include "signal_handler.hpp"
#include "web_server.hpp"
#include "window_binds.hpp"
#include "window_functions.hpp"
#include "page.hpp"
#include "logger.hpp"

using WB = RenWeb::WindowBinds;
using WF = RenWeb::WindowFunctions;
using PM = RenWeb::ProcessManager;
using WS = RenWeb::WebServer;
using SH = RenWeb::SignalHandler;
using Page = RenWeb::Page;

// -----------------------------------------
// --------------- internal ----------------
// -----------------------------------------
RenWeb::__Window__::__Window__(std::map<std::string, std::string>& opts)
  : webview::webview(false, nullptr)
  , pm(std::unique_ptr<PM>(new PM()))
  , ws(std::unique_ptr<WS>(new WS(
          static_cast<unsigned short>(std::stoi((opts["port"]))), 
          opts["ip"]
      )))
{ }
RenWeb::__Window__::~__Window__() { 
    this->ws->stop();
  Log::trace("Deconstructing __Window__");
};
void RenWeb::__Window__::__init__() {
  this->ws->start();
  this->fns.reset(new WF(this));
  this->sh.reset(new SH(this));
  this->binds.reset(new WB(this));
};
void RenWeb::__Window__::__run__() {
  this->dispatch([this](){ this->set_html("<html style=\"background-color: black; width: 100vw; height: 100vh;\"></html>"); });
#if defined(__linux__)
  this->dispatch([this](){ this->fns->setState(Page::getPageConfig()); });
#endif
  this->dispatch([this](){ this->fns->reloadPage(); });
  this->dispatch([this](){ this->fns->show(false); });
  this->dispatch([this](){ this->fns->setState(Page::getPageConfig()); });
  this->run();
}
// -----------------------------------------
// --------------- external ----------------
// -----------------------------------------
RenWeb::Window::Window(std::map<std::string, std::string>& opts)
: w(new RenWeb::__Window__(opts)) { }
RenWeb::Window::~Window() {
  Log::trace("Deconstructing Window");
};
void RenWeb::Window::run() {
  this->w->__init__();
  this->w->__run__();
}
