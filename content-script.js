// Content script that runs automatically on all Whatnot pages
// This ensures monitoring continues to work across tabs

(async function() {
    // Wait a bit for the page to load
    setTimeout(async () => {
        try {
            // Check if monitoring should be active
            const result = await chrome.storage.local.get(['isMonitoring']);
            const isMonitoring = result.isMonitoring || false;
            
            console.log('[Auto Monitor] Checking monitoring state:', isMonitoring);
            
            if (isMonitoring) {
                // Only start monitoring if we're on a Whatnot page and not already monitoring
                if (window.location.hostname.includes('whatnot.com') && !window._screenshotMonitorRunning) {
                    console.log('[Auto Monitor] Starting monitoring on new tab...');
                    
                    // Inject the monitoring functions if they don't exist
                    if (typeof window.startScreenshotMonitoring === 'undefined') {
                        // We need to inject the monitoring functions from popup.js
                        // This is a simplified version that will be enhanced by the full injection
                        
                        // First, let the background script know this tab needs monitoring
                        chrome.runtime.sendMessage({
                            type: 'initializeMonitoring',
                            tabUrl: window.location.href
                        }).catch(error => {
                            console.error('[Auto Monitor] Failed to request monitoring initialization:', error);
                        });
                    } else {
                        // Functions already exist, just start monitoring
                        window.startScreenshotMonitoring();
                    }
                }
            }
        } catch (error) {
            console.error('[Auto Monitor] Error checking monitoring state:', error);
        }
    }, 2000); // Wait 2 seconds for page to stabilize
})();

// Listen for storage changes to react to monitoring toggle from other tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.isMonitoring) {
        const newValue = changes.isMonitoring.newValue;
        const oldValue = changes.isMonitoring.oldValue;
        
        console.log('[Auto Monitor] Monitoring state changed:', oldValue, '->', newValue);
        
        if (newValue && !window._screenshotMonitorRunning) {
            // Monitoring was turned on, start it
            console.log('[Auto Monitor] Starting monitoring due to storage change...');
            chrome.runtime.sendMessage({
                type: 'initializeMonitoring',
                tabUrl: window.location.href
            }).catch(error => {
                console.error('[Auto Monitor] Failed to request monitoring initialization:', error);
            });
        } else if (!newValue && window._screenshotMonitorRunning) {
            // Monitoring was turned off, stop it
            console.log('[Auto Monitor] Stopping monitoring due to storage change...');
            if (window.stopScreenshotMonitoring) {
                window.stopScreenshotMonitoring();
            }
        }
    }
});
