#pragma once

#include "managers.hpp"
#include <boost/asio.hpp>

namespace RenWeb {
    class __Window__;
}

namespace RenWeb {
    class SignalHandler {
        private:
            RenWeb::__Window__* window_ref;
            boost::asio::io_context io_context;
            boost::asio::signal_set signals;
            std::thread io_context_thread;
        public:
            std::unique_ptr<RenWeb::CallbackManager<int, int>> signal_callbacks; 
            SignalHandler(RenWeb::__Window__* window_ref);
            ~SignalHandler();
    };
}
