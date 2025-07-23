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
                    useCORS: false,           // Disable CORS to avoid blocked resources
                    allowTaint: true,         // Allow cross-origin content to taint canvas
                    logging: false,           // Reduce html2canvas console output
                    scale: 1,                 // Maintain original scale
                    foreignObjectRendering: false, // Disable foreign object rendering (CSP friendly)
                    imageTimeout: 1000,       // Short timeout for images
                    proxy: null,              // Disable proxy usage
                    removeContainer: true,    // Clean up temporary containers
                    width: Math.min(overlayElement.offsetWidth || 500, 500),  // Limit width
                    height: Math.min(overlayElement.offsetHeight || 300, 300), // Limit height
                    ignoreElements: (element) => {
                        const tagName = element.tagName.toLowerCase();
                        
                        // Skip problematic elements that might cause CSP issues
                        if (tagName === 'script' || tagName === 'style' || tagName === 'link') {
                            return true;
                        }
                        
                        // Skip images from external domains
                        if (tagName === 'img') {
                            const src = element.src || '';
                            if (src.includes('images.whatnot.com') || 
                                src.includes('cdn.') || 
                                src.includes('amazonaws.com') ||
                                src.startsWith('data:') === false) {
                                console.log('[Canvas Screenshot] Skipping external image:', src);
                                return true;
                            }
                        }
                        
                        // Skip video elements
                        if (tagName === 'video' || tagName === 'iframe' || tagName === 'embed') {
                            return true;
                        }
                        
                        return false;
                    }
                });
                console.log('[Canvas Screenshot] Overlay element successfully rendered by html2canvas.');
            } catch (error) {
                console.error("[Canvas Screenshot] Error rendering overlay with html2canvas:", error);
                console.warn("[Canvas Screenshot] Trying minimal fallback configuration...");
                
                // Try a minimal fallback configuration that avoids most CSP issues
                try {
                    // Create a simplified clone of the element with just text content
                    const clonedElement = overlayElement.cloneNode(true);
                    
                    // Remove all potentially problematic elements from the clone
                    const problematicSelectors = ['img', 'video', 'script', 'style', 'link', 'iframe', 'embed'];
                    problematicSelectors.forEach(selector => {
                        const elements = clonedElement.querySelectorAll(selector);
                        elements.forEach(el => el.remove());
                    });
                    
                    // Temporarily append to body for rendering
                    clonedElement.style.position = 'absolute';
                    clonedElement.style.left = '-9999px';
                    clonedElement.style.top = '-9999px';
                    document.body.appendChild(clonedElement);
                    
                    overlayRenderedCanvas = await html2canvas(clonedElement, {
                        backgroundColor: null,
                        useCORS: false,
                        allowTaint: true,
                        logging: false,
                        scale: 1,
                        foreignObjectRendering: false,
                        imageTimeout: 500,
                        proxy: null,
                        removeContainer: true,
                        width: Math.min(overlayElement.offsetWidth || 300, 300),
                        height: Math.min(overlayElement.offsetHeight || 200, 200),
                        ignoreElements: () => false // Don't ignore anything in the cleaned clone
                    });
                    
                    // Remove the temporary clone
                    document.body.removeChild(clonedElement);
                    
                    console.log('[Canvas Screenshot] Overlay rendered with minimal fallback configuration.');
                } catch (fallbackError) {
                    console.error("[Canvas Screenshot] Minimal fallback rendering also failed:", fallbackError);
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
