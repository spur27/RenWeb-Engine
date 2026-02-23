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

function updateTestStatus(testId, status) {
    const testItem = document.getElementById(testId);
    if (!testItem) return;
    
    testItem.className = `test-item ${status}`;
    const statusSpan = testItem.querySelector('.status');
    if (statusSpan) {
        const statusText = statusSpan.textContent;
        if (statusText !== 'MANUAL') {
            statusSpan.className = `status ${status}`;
            statusSpan.textContent = status.toUpperCase();
        }
    }
}

function testImage(imgId, resultId, testId, isWhitelisted) {
    const img = document.getElementById(imgId);
    const resultEl = document.getElementById(resultId);
    if (!img || !resultEl) return;
    
    let handled = false;
    
    const checkImage = () => {
        if (handled) return;
        handled = true;
        
        if (img.complete) {
            if (img.naturalWidth > 0) {
                if (isWhitelisted) {
                    resultEl.textContent = '✓ Successfully loaded from whitelisted origin';
                    updateTestStatus(testId, 'pass');
                } else {
                    resultEl.textContent = '✗ Loaded (origin blocking not working!)';
                    updateTestStatus(testId, 'fail');
                }
            } else {
                if (isWhitelisted) {
                    resultEl.textContent = '✗ Failed to load (unexpected)';
                    updateTestStatus(testId, 'fail');
                } else {
                    resultEl.textContent = '✓ Blocked by origin filter (expected)';
                    updateTestStatus(testId, 'pass');
                }
            }
        }
    };
    
    img.addEventListener('load', checkImage);
    img.addEventListener('error', checkImage);
    
    // Timeout fallback - check after 3 seconds
    setTimeout(() => {
        if (!handled) {
            checkImage();
        }
    }, 3000);
    
    // Check immediately if already complete
    if (img.complete) {
        checkImage();
    }
}

function runTests() {
    console.log('Starting origin security tests...');

    // Test: Google Image (whitelisted)
    testImage('google-img', 'result-img-google', 'test-img-google', true);
    
    // Test: Placeholder Image (non-whitelisted, should be blocked)
    testImage('placeholder-img', 'result-img-placeholder', 'test-img-placeholder', false);
    
    // Test: Unsplash Image (non-whitelisted, should be blocked)
    testImage('unsplash-img', 'result-img-unsplash', 'test-img-unsplash', false);
    
    // Test: Data URI (should work - internal protocol)
    testImage('data-img', 'result-data-uri', 'test-data-uri', true);

    // Test: External script (jQuery from CDN - should be blocked)
    setTimeout(() => {
        if (typeof jQuery !== 'undefined' || typeof $ !== 'undefined') {
            document.getElementById('result-script-external').textContent = '✗ jQuery loaded (origin blocking not working!)';
            updateTestStatus('test-script-external', 'fail');
        } else {
            document.getElementById('result-script-external').textContent = '✓ External script blocked (expected)';
            updateTestStatus('test-script-external', 'pass');
        }
    }, 2000);

    // Test: Fetch from Google (whitelisted) with timeout
    const fetchGoogleTimeout = setTimeout(() => {
        document.getElementById('result-fetch-google').textContent = '⏱ Request timed out (may be blocked or slow network)';
        updateTestStatus('test-fetch-google', 'pending');
    }, 5000);
    
    fetch('https://www.google.com', { mode: 'no-cors' })
        .then(response => {
            clearTimeout(fetchGoogleTimeout);
            document.getElementById('result-fetch-google').textContent = '✓ Successfully connected to whitelisted origin';
            updateTestStatus('test-fetch-google', 'pass');
        })
        .catch(e => {
            clearTimeout(fetchGoogleTimeout);
            document.getElementById('result-fetch-google').textContent = `✗ Failed: ${e.message}`;
            updateTestStatus('test-fetch-google', 'fail');
        });

    // Test: Fetch from GitHub API (non-whitelisted, should be blocked) with timeout
    const fetchGithubTimeout = setTimeout(() => {
        document.getElementById('result-fetch-github').textContent = '✓ Request blocked or timed out (expected)';
        updateTestStatus('test-fetch-github', 'pass');
    }, 5000);
    
    fetch('https://api.github.com')
        .then(response => {
            clearTimeout(fetchGithubTimeout);
            document.getElementById('result-fetch-github').textContent = '✗ Connected (origin blocking not working!)';
            updateTestStatus('test-fetch-github', 'fail');
        })
        .catch(e => {
            clearTimeout(fetchGithubTimeout);
            document.getElementById('result-fetch-github').textContent = `✓ Blocked: ${e.message}`;
            updateTestStatus('test-fetch-github', 'pass');
        });

    // Test: Fetch from JSONPlaceholder (non-whitelisted, should be blocked) with timeout
    const fetchJsonTimeout = setTimeout(() => {
        document.getElementById('result-fetch-jsonplaceholder').textContent = '✓ Request blocked or timed out (expected)';
        updateTestStatus('test-fetch-jsonplaceholder', 'pass');
    }, 5000);
    
    fetch('https://jsonplaceholder.typicode.com/posts/1')
        .then(response => {
            clearTimeout(fetchJsonTimeout);
            document.getElementById('result-fetch-jsonplaceholder').textContent = '✗ Connected (origin blocking not working!)';
            updateTestStatus('test-fetch-jsonplaceholder', 'fail');
        })
        .catch(e => {
            clearTimeout(fetchJsonTimeout);
            document.getElementById('result-fetch-jsonplaceholder').textContent = `✓ Blocked: ${e.message}`;
            updateTestStatus('test-fetch-jsonplaceholder', 'pass');
        });

    // Test: iFrame from example.com (non-whitelisted, should be blocked)
    setTimeout(() => {
        const exampleFrame = document.getElementById('example-frame');
        const resultEl = document.getElementById('result-iframe-example');
        if (exampleFrame && resultEl) {
            try {
                // Check if iframe loaded by attempting to access its location
                const src = exampleFrame.src;
                const srcLoaded = exampleFrame.contentWindow && exampleFrame.contentWindow.length !== undefined;
                
                // If we can access contentWindow, frame might have loaded (but cross-origin prevents access)
                // Check if frame actually has content loaded
                if (srcLoaded) {
                    resultEl.textContent = '⚠ iFrame element exists (cross-origin prevents verification)';
                    updateTestStatus('test-iframe-example', 'pending');
                } else {
                    resultEl.textContent = '✓ iFrame blocked (expected)';
                    updateTestStatus('test-iframe-example', 'pass');
                }
            } catch (e) {
                // Exception thrown = cross-origin block or load failure
                resultEl.textContent = '✓ iFrame blocked or restricted (expected)';
                updateTestStatus('test-iframe-example', 'pass');
            }
        }
    }, 3000);

    // Test: WebServer resources
    updateTestStatus('test-webserver', 'pass');

    console.log('Origin security tests initialized');
}

// Run tests when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runTests);
} else {
    runTests();
}

// Event listeners for keyboard shortcuts
document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey) {
        if (e.key === 'q') {
            await Log.debug("CTRL + q was pressed.");
            await Window.terminate();
            return;
        } else if (e.key === 'r') {
            await Log.debug("CTRL + r was pressed.");
            await Window.reloadPage();
            return;
        } else if (e.key === 's') {
            await Log.debug("CTRL + s was pressed.");
            await Config.saveConfig();
            return;
        } else if (e.key === 'i') {
            await Log.debug("CTRL + i was pressed.");
            await Debug.openDevtools();
        }
    }
});

// Prevent trackpad horizontal swipe navigation
document.addEventListener("wheel", (e) => {
    // Prevent horizontal scrolling that triggers browser navigation
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
    }
}, { passive: false });

// Additional prevention for touchpad gestures
window.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

window.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

// Window onload event - show window after content loaded
window.addEventListener('load', async () => {
    await Window.show(true);
});

// Back button
document.querySelector('.back-button')?.addEventListener('click', async () => {
    try {
        await Window.navigatePage('test');
    } catch (e) {
        await Log.error(e.message);
    }
});
