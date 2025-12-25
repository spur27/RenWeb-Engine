#include "../include/args.hpp"
#include <memory>

#if defined (_WIN32)
#include <windows.h>
#include <shellapi.h>
#endif

#if defined(_WIN32)
int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrevInst, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInst; (void)hPrevInst; (void)lpCmdLine; (void)nCmdShow;
    std::unique_ptr<RenWeb::Args> args(new RenWeb::Args(__argc, __argv));
#else
int main(int argc, char** argv) {
    std::unique_ptr<RenWeb::Args> args(new RenWeb::Args(argc, argv));
#endif
    args->run();
    return 0;
}
