/// <reference path="./index.d.ts" />
import {
    Log, 
    FS,
    Window,
    System,
    Config,
    Properties,
    Process,
    Debug,
    Network,
    Navigate,
    Utils
 } from './index.js';


window.onload = async () => {
    await Window.show(true);
    await Log.info("Hello World!");
};

// Back button
document.querySelector('.back-button')?.addEventListener('click', async () => {
    try {
        await Window.navigatePage('test');
    } catch (e) {
        await Log.error(e.message);
    }
});
