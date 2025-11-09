#include "../include/app.hpp"

#if defined(_WIN32)
int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrevInst, LPSTR, int nCmdShow) {
    boost::ignore_unused(hInst);
    boost::ignore_unused(hPrevInst);
    std::unique_ptr<RenWeb::App> app(new RenWeb::App(argc, argv));
    app->run();
    return 0;
}
// int main(int argc, char** argv) {
//     std::unique_ptr<RenWeb::App> app(new RenWeb::App());
//     app->run(argc, argv);
//     return 0;
// }
#elif defined(__APPLE__)
int main(int argc, char** argv) {
    std::unique_ptr<RenWeb::App> app(new RenWeb::App(argc, argv));
    app->run();
    return 0;
}
#else
int main(int argc, char** argv) {
    std::unique_ptr<RenWeb::App> app(new RenWeb::App(argc, argv));
    app->run();
    return 0;
}
#endif