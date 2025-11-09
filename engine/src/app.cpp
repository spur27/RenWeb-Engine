#include "../include/app.hpp"

#include "logger.hpp"
#include "args.hpp"

using App = RenWeb::App;
using App = RenWeb::App;

App::App(int argc, char** argv) {
    this->argc = argc;
    this->argv = argv;
    Log::refresh();
    this->args.reset(new Args());
}

void App::run() {
    this->args->runArgs(this->argc, this->argv);
}

App::~App() { }