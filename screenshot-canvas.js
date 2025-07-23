// Content script for canvas-based screenshot with HTML overlay
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
            console.error('[Canvas Screenshot] No video element found on the page.');
            throw new Error('No video element found. Canvas screenshot requires a video element.');
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
        let overlayElement = document.getElementById('bottom-section-stream-container');

        if (!overlayElement) {
            console.warn("[Canvas Screenshot] The element with ID 'bottom-section-stream-container' was not found. Looking for alternative overlay elements...");
            
            // Try alternative selectors for Whatnot page elements
            const alternativeSelectors = [
                '[data-cy="pinned_product"]',
                '.chat-container',
                '.bottom-section',
                '.stream-overlay',
                '.auction-info'
            ];
            
            for (const selector of alternativeSelectors) {
                overlayElement = document.querySelector(selector);
                if (overlayElement) {
                    console.log(`[Canvas Screenshot] Using alternative overlay element: ${selector}`);
                    break;
                }
            }
            
            if (!overlayElement) {
                console.warn("[Canvas Screenshot] No suitable overlay element found. Taking screenshot without overlay.");
            }
        } else {
            console.log("[Canvas Screenshot] Using overlay element:", overlayElement);
        }

        // --- Step 4: Capture the video frame onto a canvas ---
        console.log('[Canvas Screenshot] Capturing video frame...');
        const videoCanvas = document.createElement('canvas');
        const videoCtx = videoCanvas.getContext('2d');
        videoCanvas.width = video.videoWidth;
        videoCanvas.height = video.videoHeight;
        videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
        console.log('[Canvas Screenshot] Video frame drawn to canvas.');

        // --- Step 5: Render the HTML overlay element (if found) ---
        let overlayRenderedCanvas = null;
        if (overlayElement) {
            console.log('[Canvas Screenshot] Rendering overlay element with html2canvas...');
            try {
                overlayRenderedCanvas = await html2canvas(overlayElement, {
                    backgroundColor: null,     // Makes background transparent
                    useCORS: false,           // Disable CORS to avoid blocked images
                    allowTaint: true,         // Allow cross-origin images (will taint canvas)
                    logging: false,           // Reduce html2canvas console output
                    scale: 1,                 // Maintain original scale
                    foreignObjectRendering: false, // Disable foreign object rendering
                    imageTimeout: 5000,       // 5 second timeout for images
                    ignoreElements: (element) => {
                        // Skip elements that might cause CORS issues
                        if (element.tagName === 'IMG') {
                            const src = element.src || '';
                            // Skip images from external domains that might cause CORS issues
                            if (src.includes('images.whatnot.com') || 
                                src.includes('cdn.') || 
                                src.includes('amazonaws.com')) {
                                console.log('[Canvas Screenshot] Skipping potentially problematic image:', src);
                                return true;
                            }
                        }
                        return false;
                    }
                });
                console.log('[Canvas Screenshot] Overlay element successfully rendered by html2canvas.');
            } catch (error) {
                console.error("[Canvas Screenshot] Error rendering overlay with html2canvas:", error);
                console.warn("[Canvas Screenshot] Trying fallback configuration...");
                
                // Try a more aggressive fallback configuration
                try {
                    overlayRenderedCanvas = await html2canvas(overlayElement, {
                        backgroundColor: null,
                        useCORS: false,
                        allowTaint: true,
                        logging: false,
                        scale: 1,
                        foreignObjectRendering: false,
                        imageTimeout: 1000,
                        ignoreElements: (element) => {
                            // Skip all images to avoid CORS issues
                            return element.tagName === 'IMG' || element.tagName === 'VIDEO';
                        }
                    });
                    console.log('[Canvas Screenshot] Overlay rendered with fallback configuration (images skipped).');
                } catch (fallbackError) {
                    console.error("[Canvas Screenshot] Fallback rendering also failed:", fallbackError);
                    console.warn("[Canvas Screenshot] Continuing without overlay...");
                    overlayRenderedCanvas = null;
                }
            }
        }

        // --- Step 6: Composite overlay onto video canvas (if overlay exists) ---
        if (overlayRenderedCanvas) {
            console.log('[Canvas Screenshot] Compositing overlay onto video frame (at bottom)...');

            const margin = 20; // Pixels from bottom and side edges of the video frame

            // Calculate Y position: videoCanvas height - overlay canvas height - margin
            const overlayY = Math.max(0, videoCanvas.height - overlayRenderedCanvas.height - margin);

            // Calculate X position: margin from the left
            const overlayX = margin;

            // Optional: Center horizontally at the bottom
            // const overlayX = Math.max(0, (videoCanvas.width / 2) - (overlayRenderedCanvas.width / 2));

            videoCtx.drawImage(overlayRenderedCanvas, overlayX, overlayY);
            console.log('[Canvas Screenshot] Overlay composited onto video canvas.');
        }

        // --- Step 7: Get the final combined image as a Data URL ---
        const finalImageDataURL = videoCanvas.toDataURL('image/png');
        console.log('[Canvas Screenshot] Final combined image Data URL generated (PNG).');

        // --- Step 8: Return the data URL for download ---
        return {
            success: true,
            dataUrl: finalImageDataURL,
            width: videoCanvas.width,
            height: videoCanvas.height,
            hasOverlay: overlayRenderedCanvas !== null
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
