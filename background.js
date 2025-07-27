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
    // Get tab ID from either sender (content script) or message payload (popup)
    let tabId = null;
    
    if (message.tabId) {
      // Message from popup with explicit tab ID
      tabId = message.tabId;
    } else if (sender && sender.tab && sender.tab.id) {
      // Message from content script with sender context
      tabId = sender.tab.id;
    }
    
    if (tabId) {
      handleScreenshot(tabId, message.triggerType, message.productNumber);
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
  
  if (message.type === "initializeMonitoring") {
    // Handle monitoring initialization request from content script
    if (sender && sender.tab && sender.tab.id) {
      initializeMonitoringOnTab(sender.tab.id);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No valid tab ID' });
    }
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
    
    // Generate filename with streamer name, item number, and datetime
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const currentDateTime = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    
    // Build filename with streamer name and item number
    let filename;
    const streamerName = screenshotResult.streamerName;
    const itemNumber = screenshotResult.itemNumber;
    
    // Extract just the number from itemNumber (remove the # if present)
    const cleanItemNumber = itemNumber ? itemNumber.replace('#', '') : null;
    
    if (streamerName && cleanItemNumber) {
      // Format: "beautyseller-20250726-174822-product-548.png"
      filename = `${streamerName}-${currentDateTime}-product-${cleanItemNumber}.png`;
    } else if (streamerName) {
      // Format: "beautyseller-20250726-174822-product-unknown.png"
      filename = `${streamerName}-${currentDateTime}-product-${productNumber}.png`;
    } else if (cleanItemNumber) {
      // Format: "20250726-174822-product-548.png"
      filename = `${currentDateTime}-product-${cleanItemNumber}.png`;
    } else {
      // Fallback to original format
      filename = `${currentDateTime}-product-${productNumber}.png`;
    }
    
    console.log(`[Canvas Screenshot] Generated filename: ${filename}`);
    
    // Download the screenshot
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
    
    // Show notification with additional info
    const overlayInfo = screenshotResult.hasOverlay ? ' (with overlay)' : ' (video only)';
    const displayName = itemNumber || `Product #${productNumber}`;
    const sellerInfo = streamerName ? ` by ${streamerName}` : '';
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Canvas Screenshot Taken',
      message: `Screenshot saved: ${displayName}${sellerInfo}${overlayInfo}`
    });
    
    console.log(`[Canvas Screenshot] Saved: ${filename} - ${screenshotResult.width}x${screenshotResult.height}${overlayInfo} - Streamer: ${streamerName || 'unknown'} - Item: ${itemNumber || 'unknown'}`);
    
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

// Function to initialize monitoring on a specific tab
async function initializeMonitoringOnTab(tabId) {
  try {
    console.log(`[Background] Initializing monitoring on tab ${tabId}...`);
    
    // Check if monitoring should be active
    const result = await chrome.storage.local.get(['isMonitoring']);
    if (!result.isMonitoring) {
      console.log('[Background] Monitoring is disabled, skipping initialization');
      return;
    }
    
    // Get tab info to verify it's a Whatnot page
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.includes('whatnot.com')) {
      console.log('[Background] Tab is not a Whatnot page, skipping monitoring initialization');
      return;
    }
    
    // Inject the monitoring functions (same as popup.js does)
    await chrome.scripting.executeScript({
      target: { tabId },
      func: stopScreenshotMonitoring
    });
    
    await chrome.scripting.executeScript({
      target: { tabId },
      func: startScreenshotMonitoring
    });
    
    console.log(`[Background] Monitoring initialized successfully on tab ${tabId}`);
    
  } catch (error) {
    console.error(`[Background] Failed to initialize monitoring on tab ${tabId}:`, error);
  }
}

// Monitoring functions (copied from popup.js to be available in background context)
function stopScreenshotMonitoring() {
  if (window.stopScreenshotMonitoring) {
    window.stopScreenshotMonitoring();
  } else {
    // Fallback if the window function doesn't exist
    window._screenshotMonitorRunning = false;
    
    if (window._screenshotTimeout) {
      clearTimeout(window._screenshotTimeout);
      window._screenshotTimeout = null;
    }
    
    if (window._screenshotMutationObserver) {
      window._screenshotMutationObserver.disconnect();
      window._screenshotMutationObserver = null;
    }
    
    console.log('[Screenshot Monitor] Monitoring stopped (fallback)');
  }
}

function startScreenshotMonitoring() {
  // Define stop function locally to ensure it's always available
  function stopScreenshotMonitoring() {
    window._screenshotMonitorRunning = false;
    
    // Clear any pending screenshot timeout
    if (window._screenshotTimeout) {
      clearTimeout(window._screenshotTimeout);
      window._screenshotTimeout = null;
    }
    
    if (window._screenshotMutationObserver) {
      window._screenshotMutationObserver.disconnect();
      window._screenshotMutationObserver = null;
    }
    
    console.log('[Screenshot Monitor] Monitoring stopped');
  }
  
  // Make stop function globally available for external calls
  window.stopScreenshotMonitoring = stopScreenshotMonitoring;
  
  // Stop any existing monitoring first
  if (window._screenshotMonitorRunning) {
    stopScreenshotMonitoring();
  }
  
  window._screenshotMonitorRunning = true;
  window._lastScreenshotTime = 0;
  window._lastButtonState = false;
  window._screenshotTakenForCurrentButton = false;
  
  console.log('[Screenshot Monitor] Starting bid button detection...');
  
  const COOLDOWN_MS = 2000; // 2 second cooldown
  const SCREENSHOT_DELAY_MS = 1000; // 1 second delay before taking screenshot
  const BID_SELECTORS = [
    'button[data-cy="bid_button"]',
    'button[data-cy="custom_bid_button"]'
  ];
  
  function takeScreenshotIfNeeded(triggerType) {
    const now = Date.now();
    if (now - window._lastScreenshotTime < COOLDOWN_MS) {
      console.log('[Screenshot Monitor] Cooldown active, skipping screenshot');
      return false;
    }
    
    // Clear any existing timeout
    if (window._screenshotTimeout) {
      clearTimeout(window._screenshotTimeout);
    }
    
    // Set up 1-second delay before taking screenshot
    window._screenshotTimeout = setTimeout(() => {
      // Check if monitoring is still active and button still exists
      if (!window._screenshotMonitorRunning) {
        console.log('[Screenshot Monitor] Monitoring stopped, cancelling delayed screenshot');
        return;
      }
      
      // Check if video element still exists (stream still active)
      const videoElement = document.querySelector('video');
      if (!videoElement) {
        console.log('[Screenshot Monitor] No video element found, stream may have ended. Stopping monitoring...');
        stopScreenshotMonitoring();
        return;
      }
      
      // Double-check button still exists before taking screenshot
      let buttonExists = false;
      for (const selector of BID_SELECTORS) {
        if (document.querySelector(selector)) {
          buttonExists = true;
          break;
        }
      }
      
      if (!buttonExists && triggerType !== 'manual') {
        console.log('[Screenshot Monitor] Button no longer exists, cancelling delayed screenshot');
        return;
      }
      
      // Extract product order number from the pinned product element
      let productNumber = 'unknown';
      try {
        const pinnedProductElement = document.querySelector('div[data-cy="pinned_product"]');
        if (pinnedProductElement) {
          const textContent = pinnedProductElement.textContent || '';
          // Look for pattern like "#157" or "#123"
          const match = textContent.match(/#(\d+)/);
          if (match && match[1]) {
            productNumber = match[1];
            console.log('[Screenshot Monitor] Found product number:', productNumber);
          }
        }
      } catch (error) {
        console.error('[Screenshot Monitor] Error extracting product number:', error);
      }
      
      window._lastScreenshotTime = Date.now();
      console.log(`[Screenshot Monitor] Taking delayed screenshot (1s) - trigger: ${triggerType}, product: ${productNumber}`);
      
      // Check if chrome.runtime is available before sending message
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        // Send message to background script with product number
        chrome.runtime.sendMessage({
          type: "takeScreenshot",
          triggerType: triggerType,
          productNumber: productNumber
        }).catch(error => {
          console.error('[Screenshot Monitor] Failed to send screenshot message:', error);
          // Try to reinitialize monitoring if extension context is lost
          if (error.message && error.message.includes('context invalidated')) {
            console.log('[Screenshot Monitor] Extension context invalidated, stopping monitoring');
            stopScreenshotMonitoring();
          }
        });
      } else {
        console.error('[Screenshot Monitor] Chrome runtime not available - extension context may be invalidated');
        stopScreenshotMonitoring();
      }
    }, SCREENSHOT_DELAY_MS);
    
    return true;
  }
  
  function checkForBidButtons() {
    if (!window._screenshotMonitorRunning) return;
    
    // Check if video element still exists (stream still active)
    const videoElement = document.querySelector('video');
    if (!videoElement) {
      console.log('[Screenshot Monitor] No video element found, stream has ended. Stopping monitoring...');
      stopScreenshotMonitoring();
      return;
    }
    
    let buttonExists = false;
    let foundButton = null;
    
    // Check for bid buttons using the same selectors as the auto-bidder
    for (const selector of BID_SELECTORS) {
      foundButton = document.querySelector(selector);
      if (foundButton) {
        buttonExists = true;
        break;
      }
    }
    
    // State transition: button appeared (false -> true)
    if (buttonExists && !window._lastButtonState) {
      console.log('[Screenshot Monitor] Bid button appeared!', foundButton);
      if (takeScreenshotIfNeeded('state-transition')) {
        window._screenshotTakenForCurrentButton = true;
      }
    }
    // State transition: button disappeared (true -> false)  
    else if (!buttonExists && window._lastButtonState) {
      console.log('[Screenshot Monitor] Bid button disappeared!');
      window._screenshotTakenForCurrentButton = false; // Reset for next button appearance
    }
    // Button still exists but we haven't taken a screenshot for this button yet
    else if (buttonExists && !window._screenshotTakenForCurrentButton) {
      console.log('[Screenshot Monitor] Bid button still present, taking delayed screenshot');
      if (takeScreenshotIfNeeded('auto')) {
        window._screenshotTakenForCurrentButton = true;
      }
    }
    
    window._lastButtonState = buttonExists;
  }
  
  // Use MutationObserver just like the auto-bidder
  if (window._screenshotMutationObserver) {
    window._screenshotMutationObserver.disconnect();
  }
  
  window._screenshotMutationObserver = new MutationObserver(() => {
    if (!window._screenshotMonitorRunning) return;
    checkForBidButtons();
  });
  
  // Observe DOM changes
  window._screenshotMutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Initial check
  checkForBidButtons();
  
  console.log('[Screenshot Monitor] Monitoring started with selectors:', BID_SELECTORS);
}
