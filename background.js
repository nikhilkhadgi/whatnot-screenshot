// background.js (service worker context)
let screenshotCounter = 0;

// Initialize counter from storage on startup
chrome.runtime.onStartup.addListener(async () => {
  const result = await chrome.storage.local.get(['screenshotCounter']);
  screenshotCounter = result.screenshotCounter || 0;
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "takeScreenshot") {
    // Check if sender.tab exists and has an id
    if (sender && sender.tab && sender.tab.id) {
      handleScreenshot(sender.tab.id, message.triggerType, message.productNumber);
      sendResponse({ success: true });
    } else {
      console.error('[Background] No valid tab ID provided for screenshot');
      sendResponse({ success: false, error: 'No valid tab ID' });
    }
    return true;
  }
  
  if (message.type === "getScreenshotCount") {
    sendResponse({ count: screenshotCounter });
    return true;
  }
  
  if (message.type === "resetCounter") {
    screenshotCounter = 0;
    chrome.storage.local.set({ screenshotCounter: 0 });
    sendResponse({ success: true });
    return true;
  }
});

async function handleScreenshot(tabId, triggerType = 'auto', productNumber = 'unknown') {
  try {
    // Inject the html2canvas library first
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['html2canvas.min.js']
    });
    
    // Then inject the canvas screenshot script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['screenshot-canvas.js']
    });
    
    // Execute the canvas screenshot function
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (productNum) => {
        return window.takeCanvasScreenshot(productNum);
      },
      args: [productNumber]
    });
    
    const screenshotResult = result[0]?.result;
    
    if (!screenshotResult || !screenshotResult.success) {
      // Check if this is a "stream ended" scenario
      if (screenshotResult && screenshotResult.streamEnded) {
        console.log('[Canvas Screenshot] Stream has ended, stopping monitoring...');
        
        // Stop monitoring by injecting the stop function
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              if (window.stopScreenshotMonitoring) {
                window.stopScreenshotMonitoring();
                console.log('[Screenshot Monitor] Monitoring stopped due to stream end.');
              }
            }
          });
          
          // Update monitoring state in storage
          await chrome.storage.local.set({ isMonitoring: false });
          
          // Show notification about stream end
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Stream Ended',
            message: 'Live stream has ended. Screenshot monitoring stopped.'
          });
          
          return; // Exit without throwing error
        } catch (stopError) {
          console.error('[Canvas Screenshot] Failed to stop monitoring:', stopError);
        }
      }
      
      throw new Error(screenshotResult?.error || 'Canvas screenshot failed');
    }
    
    const dataUrl = screenshotResult.dataUrl;
    
    // Increment counter
    screenshotCounter++;
    
    // Save counter to storage
    chrome.storage.local.set({ screenshotCounter });
    
    // Generate filename with current datetime and product number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const currentDateTime = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    const filename = `${currentDateTime}-product-${productNumber}.png`;
    
    // Download the screenshot
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
    
    // Show notification with additional info
    const overlayInfo = screenshotResult.hasOverlay ? ' (with overlay)' : ' (video only)';
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Canvas Screenshot Taken',
      message: `Screenshot saved: Product #${productNumber}${overlayInfo}`
    });
    
    console.log(`[Canvas Screenshot] Saved: ${filename} - ${screenshotResult.width}x${screenshotResult.height}${overlayInfo}`);
    
  } catch (error) {
    console.error('[Canvas Screenshot] Error:', error);
    
    // Fallback to traditional screenshot if canvas method fails
    console.log('[Canvas Screenshot] Falling back to traditional screenshot method...');
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      
      // Increment counter
      screenshotCounter++;
      chrome.storage.local.set({ screenshotCounter });
      
      // Generate filename
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      const currentDateTime = `${year}${month}${day}-${hours}${minutes}${seconds}`;
      const filename = `${currentDateTime}-product-${productNumber}.png`;
      
      await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      });
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'Screenshot Taken (Fallback)',
        message: `Screenshot saved: Product #${productNumber} (fallback method)`
      });
      
      console.log(`[Screenshot] Fallback saved: ${filename}`);
      
    } catch (fallbackError) {
      console.error('[Screenshot] Fallback also failed:', fallbackError);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'Screenshot Failed',
        message: 'Both canvas and fallback methods failed: ' + error.message
      });
    }
  }
}

// Load counter from storage when service worker starts
chrome.storage.local.get(['screenshotCounter']).then((result) => {
  screenshotCounter = result.screenshotCounter || 0;
});
