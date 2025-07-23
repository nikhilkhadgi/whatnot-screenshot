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
    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
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
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Screenshot Taken',
      message: `Screenshot saved: Product #${productNumber}`
    });
    
    console.log(`[Screenshot] Saved: ${filename}`);
    
  } catch (error) {
    console.error('[Screenshot] Error:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Screenshot Failed',
      message: 'Failed to take screenshot: ' + error.message
    });
  }
}

// Load counter from storage when service worker starts
chrome.storage.local.get(['screenshotCounter']).then((result) => {
  screenshotCounter = result.screenshotCounter || 0;
});
