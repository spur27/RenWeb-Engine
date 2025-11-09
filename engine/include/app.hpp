#pragma once

#include <memory>

namespace RenWeb {
  class Args;
}

namespace RenWeb {
    class App {
        private:
          char** argv;
          int argc;
          std::unique_ptr<RenWeb::Args> args;
          // ----------
        public:
            App(int argc, char** argv);
            ~App();
            void run();
    };
};
