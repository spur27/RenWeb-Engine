#include "signal_handler.hpp"

#include <string>
#include "logger.hpp"
#include "window.hpp"
#include "window_functions.hpp"

using SH = RenWeb::SignalHandler;
using CM = RenWeb::CallbackManager<int, int>;

SH::SignalHandler(RenWeb::__Window__* window_ref)
    : window_ref(window_ref)
    , io_context()
    , signals(this->io_context)
    , signal_callbacks(new CM())
{
    this->signal_callbacks->add(SIGINT, [this](int signal){
        Log::debug("Caught signal " + std::to_string(signal));
        this->window_ref->fns->terminate();
    })
    ->add(SIGTERM, [this](int signal){
        this->signal_callbacks->run(SIGINT, signal);
    })
    ->add(SIGABRT, [this](int signal){
        this->signal_callbacks->run(SIGINT, signal);
    });
  // ----------------
    for (const auto& [signal, callback] : this->signal_callbacks->getMap()) {
        (void)callback;
        this->signals.add(signal);
    }
  // ----------------
    this->signals.async_wait([this](const boost::system::error_code& error, int signal){
        if (error) {
            Log::error("CAUGHT SIGNAL " + std::to_string(signal));
            Log::error(error.what());
        }
        this->signal_callbacks->run(signal, signal);
    });
  // ----------------
    this->io_context_thread = std::thread([this](){
        Log::trace("Starting signal handler thread...");
        this->io_context.run();
        Log::trace("Exiting signal handler thread...");
    });
}
SH::~SignalHandler() { 
    this->signals.cancel();
    this->signals.clear();
    this->io_context.stop();
    this->io_context_thread.join();
    Log::trace("Deconstructing SignalHandler");
}