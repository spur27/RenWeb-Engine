#include "../include/args.hpp"
#include <memory>

#if defined (_WIN32)
#include <windows.h>
#include <shellapi.h>
#endif

#if defined(_WIN32)
int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrevInst, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInst; (void)hPrevInst; (void)lpCmdLine; (void)nCmdShow;
    auto args = std::make_unique<RenWeb::Args>(__argc, __argv);
#else
int main(int argc, char** argv) {
    auto args = std::make_unique<RenWeb::Args>(argc, argv);
#endif
    args->run();
    return 0;
}
