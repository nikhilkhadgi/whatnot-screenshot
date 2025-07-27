// Content script for canvas-based screenshot with HTML overlay

/**
 * Retrieves the streamer/seller name from the page title or Twitter meta tag.
 * This is often the actual person/entity hosting the livestream.
 *
 * @returns {string|null} The streamer name if found, otherwise null.
 */
function getStreamerNameFromHtml() {
    // Try to get from the <title> tag first
    const titleElement = document.querySelector('title');
    if (titleElement) {
        const titleText = titleElement.textContent;
        const match = titleText.match(/@([^']+)'s Livestream on Whatnot/);
        if (match && match[1]) {
            return match[1]; // Returns "madsluxe"
        }
    }

    // If not found in title, try the twitter:title meta tag
    const twitterTitleMeta = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitleMeta) {
        const content = twitterTitleMeta.getAttribute('content');
        if (content) {
            const match = content.match(/@([^']+)'s Livestream on Whatnot/);
            if (match && match[1]) {
                return match[1]; // Returns "madsluxe"
            }
        }
    }

    return null; // Return null if not found
}

async function takeCanvasScreenshot(productNumber = 'unknown') {
    try {
        console.log('[Canvas Screenshot] Starting canvas-based screenshot process...');
        
        // --- Step 1: html2canvas library is loaded via background script injection ---
        // The library should already be available since we inject it via executeScript
        if (typeof html2canvas === 'undefined') {
            console.error('[Canvas Screenshot] html2canvas not available. This should not happen.');
            throw new Error('html2canvas library not available. Extension injection failed.');
        } else {
            console.log('[Canvas Screenshot] html2canvas is available.');
        }

        // --- Step 2: Find video element on the page ---
        let video = document.querySelector('video');
        if (!video) {
            console.warn('[Canvas Screenshot] No video element found on the page. Stream may have ended.');
            // Return a special error code to indicate stream has ended
            return {
                success: false,
                error: 'NO_VIDEO_ELEMENT',
                streamEnded: true,
                message: 'No video element found. Live stream may have ended.'
            };
        }

        console.log('[Canvas Screenshot] Found video element:', video);

        // Ensure the video is playing and has data
        if (video.paused && video.readyState === 0) {
            try {
                await video.play();
                console.log('[Canvas Screenshot] Video started playing to capture frame.');
            } catch (e) {
                console.warn('[Canvas Screenshot] Could not autoplay video. Ensure it is playing for a valid frame capture.', e);
            }
        }

        // Wait until video has enough data to draw
        if (video.readyState < 2) { // HTMLMediaElement.HAVE_CURRENT_DATA
            console.log("[Canvas Screenshot] Video not ready (readyState: " + video.readyState + "). Waiting for 'loadeddata' event...");
            await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
            console.log("[Canvas Screenshot] Video is now ready (readyState: " + video.readyState + ").");
        }

        // Check if video dimensions are available
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.error("[Canvas Screenshot] Video dimensions are 0. Cannot capture frame.");
            throw new Error("Video is not ready. Ensure video has loaded data.");
        }

        // --- Step 3: Find the HTML overlay element ---
        let overlayElement = null;
        
        console.log('[Canvas Screenshot] Searching for product name element...');
        
        // Look for the pinned_product element and find the product title
        const pinnedProductElement = document.querySelector('div[data-cy="pinned_product"]');
        if (pinnedProductElement) {
            console.log('[Canvas Screenshot] Found pinned_product element');
            
            // Find the element with font-weight: 600 which contains the product title
            const productNameElement = pinnedProductElement.querySelector('div[style*="font-weight: 600"]');
            if (productNameElement && productNameElement.textContent) {
                console.log(`[Canvas Screenshot] Found product name element: ${productNameElement.textContent.trim()}`);
                overlayElement = productNameElement;
            }
        }
        
        if (!overlayElement) {
            console.warn("[Canvas Screenshot] Product name element not found. Taking screenshot without overlay.");
        }

        // --- Step 4: Capture the video frame onto a canvas ---
        console.log('[Canvas Screenshot] Capturing video frame...');
        const videoCanvas = document.createElement('canvas');
        const videoCtx = videoCanvas.getContext('2d');
        videoCanvas.width = video.videoWidth;
        videoCanvas.height = video.videoHeight;
        videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
        console.log('[Canvas Screenshot] Video frame drawn to canvas.');

        // --- Step 5: Extract text content and create custom overlay ---
        let overlayText = null;
        if (overlayElement) {
            console.log('[Canvas Screenshot] Extracting text from overlay element...');
            
            // Extract the text content from the element
            const fullText = overlayElement.textContent.trim();
            console.log(`[Canvas Screenshot] Full extracted text: "${fullText}"`);
            
            // Extract only the number part (e.g., "#455" from "As is no cancellations #455")
            const numberMatch = fullText.match(/#\d+/);
            if (numberMatch) {
                overlayText = numberMatch[0];
                console.log(`[Canvas Screenshot] Extracted number only: "${overlayText}"`);
            } else {
                console.log(`[Canvas Screenshot] No number found in text, using full text: "${fullText}"`);
                overlayText = fullText;
            }
        }

        // --- Step 6: Draw custom text overlay directly on canvas ---
        if (overlayText) {
            console.log('[Canvas Screenshot] Drawing custom text overlay on canvas...');
            
            // Set up text styling
            const fontSize = Math.max(24, Math.floor(videoCanvas.width / 40)); // Responsive font size
            const fontFamily = 'Arial, sans-serif';
            const textColor = '#FFFFFF';
            const backgroundColor = 'rgba(0, 0, 0, 0.8)';
            const padding = 16;
            const borderRadius = 8;
            const margin = 30;
            
            // Configure text rendering
            videoCtx.font = `bold ${fontSize}px ${fontFamily}`;
            videoCtx.textAlign = 'left';
            videoCtx.textBaseline = 'top';
            
            // Measure text dimensions
            const textMetrics = videoCtx.measureText(overlayText);
            const textWidth = textMetrics.width;
            const textHeight = fontSize;
            
            // Calculate overlay dimensions and position
            const overlayWidth = textWidth + (padding * 2);
            const overlayHeight = textHeight + (padding * 2);
            const overlayX = margin;
            const overlayY = videoCanvas.height - overlayHeight - margin;
            
            // Draw background rectangle with rounded corners
            videoCtx.fillStyle = backgroundColor;
            videoCtx.beginPath();
            
            // Use roundRect if available, otherwise draw regular rectangle
            if (typeof videoCtx.roundRect === 'function') {
                videoCtx.roundRect(overlayX, overlayY, overlayWidth, overlayHeight, borderRadius);
            } else {
                // Fallback to regular rectangle
                videoCtx.rect(overlayX, overlayY, overlayWidth, overlayHeight);
            }
            videoCtx.fill();
            
            // Draw border
            videoCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            videoCtx.lineWidth = 2;
            videoCtx.stroke();
            
            // Draw text shadow for better readability
            videoCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            videoCtx.fillText(overlayText, overlayX + padding + 2, overlayY + padding + 2);
            
            // Draw main text
            videoCtx.fillStyle = textColor;
            videoCtx.fillText(overlayText, overlayX + padding, overlayY + padding);
            
            console.log(`[Canvas Screenshot] Custom text overlay drawn: "${overlayText}" at (${overlayX}, ${overlayY})`);
        }

        // --- Step 7: Get the final combined image as a Data URL ---
        const finalImageDataURL = videoCanvas.toDataURL('image/png');
        console.log('[Canvas Screenshot] Final combined image Data URL generated (PNG).');

        // --- Step 8: Get streamer name for filename ---
        const streamerName = getStreamerNameFromHtml();
        if (streamerName) {
            console.log(`[Canvas Screenshot] Streamer/Seller Name: ${streamerName}`);
        } else {
            console.log('[Canvas Screenshot] Streamer/Seller name not found in HTML title/meta tags.');
        }

        // --- Step 9: Return the data URL for download ---
        return {
            success: true,
            dataUrl: finalImageDataURL,
            width: videoCanvas.width,
            height: videoCanvas.height,
            hasOverlay: overlayText !== null,
            streamerName: streamerName,
            itemNumber: overlayText
        };

    } catch (error) {
        console.error("[Canvas Screenshot] An error occurred during the process:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Make the function available globally for injection
window.takeCanvasScreenshot = takeCanvasScreenshot;
