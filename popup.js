// Popup script for Screenshot Extension
const monitoringToggle = document.getElementById('monitoringToggle');
const manualScreenshotBtn = document.getElementById('manualScreenshotBtn');
const resetCounterBtn = document.getElementById('resetCounterBtn');
const screenshotCountElement = document.getElementById('screenshotCount');
const pageStatusElement = document.getElementById('pageStatus');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await updateUI();
  await checkWhatnotPage();
  
  // Restore monitoring state
  const result = await chrome.storage.local.get(['isMonitoring']);
  monitoringToggle.checked = result.isMonitoring || false;
});

// Update UI with current screenshot count
async function updateUI() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "getScreenshotCount" });
    screenshotCountElement.textContent = response.count || 0;
  } catch (error) {
    console.error('Failed to get screenshot count:', error);
    screenshotCountElement.textContent = '0';
  }
}

// Check if current tab is on whatnot.com
async function checkWhatnotPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isWhatnotPage = tab.url && tab.url.includes('whatnot.com');
    
    pageStatusElement.textContent = isWhatnotPage ? 'Whatnot ✓' : 'Not Whatnot ✗';
    pageStatusElement.className = `status-value ${isWhatnotPage ? 'success' : 'error'}`;
    
    // Disable manual screenshot if not on Whatnot
    manualScreenshotBtn.disabled = !isWhatnotPage;
    if (!isWhatnotPage) {
      manualScreenshotBtn.textContent = '📷 Whatnot Only';
    } else {
      manualScreenshotBtn.textContent = '📷 Take Screenshot';
    }
  } catch (error) {
    console.error('Failed to check page:', error);
    pageStatusElement.textContent = 'Unknown ❓';
    pageStatusElement.className = 'status-value error';
  }
}

// Monitoring toggle handler
monitoringToggle.addEventListener('change', async () => {
  const isMonitoring = monitoringToggle.checked;
  
  try {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      monitoringToggle.checked = false;
      alert('Extension context has been invalidated. Please reload the extension.');
      return;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('whatnot.com')) {
      // Not on Whatnot page
      monitoringToggle.checked = false;
      alert('Monitoring only works on whatnot.com pages!');
      return;
    }
    
    // Save state
    await chrome.storage.local.set({ isMonitoring });
    
    if (isMonitoring) {
      // Start monitoring
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: startScreenshotMonitoring
      });
    } else {
      // Stop monitoring
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: stopScreenshotMonitoring
      });
    }
  } catch (error) {
    console.error('Failed to toggle monitoring:', error);
    monitoringToggle.checked = false;
    if (error.message && error.message.includes('context invalidated')) {
      alert('Extension context has been invalidated. Please reload the extension.');
    } else {
      alert('Failed to toggle monitoring: ' + error.message);
    }
  }
});

// Manual screenshot button handler
manualScreenshotBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('whatnot.com')) {
      alert('Screenshots can only be taken on whatnot.com pages!');
      return;
    }
    
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      alert('Extension context has been invalidated. Please reload the extension.');
      return;
    }
    
    // Extract product number from current page
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        let productNumber = 'unknown';
        try {
          const pinnedProductElement = document.querySelector('div[data-cy="pinned_product"]');
          if (pinnedProductElement) {
            const textContent = pinnedProductElement.textContent || '';
            const match = textContent.match(/#(\d+)/);
            if (match && match[1]) {
              productNumber = match[1];
            }
          }
        } catch (error) {
          console.error('Error extracting product number:', error);
        }
        return productNumber;
      }
    });
    
    const productNumber = result?.[0]?.result || 'unknown';
    
    // Take manual screenshot with product number
    await chrome.runtime.sendMessage({ 
      type: "takeScreenshot", 
      triggerType: "manual",
      productNumber: productNumber
    });
    
    // Update UI
    setTimeout(updateUI, 500);
    
  } catch (error) {
    console.error('Failed to take manual screenshot:', error);
    if (error.message && error.message.includes('context invalidated')) {
      alert('Extension context has been invalidated. Please reload the extension.');
    } else {
      alert('Failed to take screenshot: ' + error.message);
    }
  }
});

// Reset counter button handler
resetCounterBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to reset the screenshot counter?')) {
    try {
      await chrome.runtime.sendMessage({ type: "resetCounter" });
      await updateUI();
    } catch (error) {
      console.error('Failed to reset counter:', error);
      alert('Failed to reset counter: ' + error.message);
    }
  }
});

// Injected functions for content script
function startScreenshotMonitoring() {
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
    
    window._lastScreenshotTime = now;
    console.log(`[Screenshot Monitor] Taking screenshot - trigger: ${triggerType}, product: ${productNumber}`);
    
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
      return false;
    }
    
    return true;
  }
  
  function checkForBidButtons() {
    if (!window._screenshotMonitorRunning) return;
    
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

function stopScreenshotMonitoring() {
  window._screenshotMonitorRunning = false;
  
  if (window._screenshotMutationObserver) {
    window._screenshotMutationObserver.disconnect();
    window._screenshotMutationObserver = null;
  }
  
  console.log('[Screenshot Monitor] Monitoring stopped');
}

