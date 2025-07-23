# Whatnot Auction Screenshot Extension

A Chrome extension that automatically takes screenshots when bid buttons become available on Whatnot auctions.

## Features

- **Automatic Screenshot Detection**: Uses the same bid button detection logic as the original auto-bidder
- **Smart Monitoring**: Detects when bid buttons appear using `button[data-cy="bid_button"]` and `button[data-cy="custom_bid_button"]` selectors
- **Screenshot Management**: 
  - Sequential naming: `whatnot-auction-0001-trigger.png`, `whatnot-auction-0002-trigger.png`, etc.
  - Trigger types: `auto`, `manual`, `state-transition`
  - 1-second delay before taking screenshots (prevents accidental triggers)
  - 2-second cooldown between automatic screenshots
- **User Interface**:
  - Start/Stop monitoring toggle (starts OFF by default)
  - Manual screenshot button
  - Screenshot counter display
  - Current page indicator (Whatnot ✓ or Not Whatnot ✗)
  - Reset counter functionality

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the extension folder
4. The extension will appear in your Chrome toolbar

## Usage

### Basic Usage
1. Navigate to a Whatnot auction page
2. Click the extension icon to open the popup
3. Toggle "Monitoring" ON to start automatic screenshot detection
4. Use "Take Screenshot" button for manual screenshots

### Features Explained

**Automatic Monitoring**:
- Monitors DOM changes using MutationObserver (same as auto-bidder)
- Waits 1 second after bid buttons appear before taking screenshots
- Includes 2-second cooldown to prevent spam
- Only works on whatnot.com pages

**Manual Screenshots**:
- Take screenshots anytime with the manual button
- Works immediately without cooldown
- Saves with "manual" trigger type

**Screenshot Management**:
- All screenshots saved to Downloads folder
- Sequential numbering prevents conflicts
- Counter persists across browser sessions
- Reset counter when needed

## Technical Details

### Permissions Required
- `scripting`: Inject content scripts for bid detection
- `activeTab`: Access current tab information
- `storage`: Save screenshot counter and settings
- `downloads`: Save screenshots to Downloads folder
- `notifications`: Show screenshot confirmation

### File Structure
- `manifest.json`: Extension configuration
- `background.js`: Service worker for screenshot handling
- `popup.html`: Extension popup interface
- `popup.js`: Popup functionality and content script injection
- Icon files: 16px, 32px, 48px, 128px

### Bid Detection Logic
The extension uses the exact same bid button detection mechanism as the original auto-bidder:

```javascript
const BID_SELECTORS = [
  'button[data-cy="bid_button"]',
  'button[data-cy="custom_bid_button"]'
];
```

- MutationObserver monitors DOM changes
- Detects when bid buttons appear/disappear
- Takes screenshots on state transitions
- Maintains console logging for debugging

## Differences from Auto-Bidder

| Auto-Bidder | Screenshot Extension |
|-------------|---------------------|
| Clicks bid buttons | Takes screenshots |
| Username/bid limit config | Simple on/off toggle |
| Firebase remote sync | Local storage only |
| Continuous clicking | Cooldown between shots |
| Complex UI with settings | Streamlined interface |

## Troubleshooting

**Extension not working?**
- Ensure you're on a whatnot.com page
- Check that monitoring is enabled
- Look for console logs in Developer Tools

**No screenshots being taken?**
- Verify Downloads permission is granted
- Check if bid buttons are actually present
- Try manual screenshot first

**Too many screenshots?**
- 1-second delay + 2-second cooldown should prevent spam
- Stop monitoring when not needed
- Reset counter to clean up

## Privacy & Security

- No data sent to external servers
- No tracking or analytics
- Only accesses whatnot.com pages
- Screenshots stored locally only

## Development

The extension preserves the core bid detection logic from the auto-bidder while replacing the bidding functionality with screenshot capture. All timing, selectors, and DOM monitoring patterns remain identical to ensure reliability.

---

**Note**: This extension is for personal use only. Please respect Whatnot's terms of service and auction guidelines.
