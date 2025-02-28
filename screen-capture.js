/**
 * Screen capture module
 * This module handles capturing the screen and processing frames
 */

const { ipcRenderer } = require('electron');

class ScreenCapture {
    constructor(frameRate = 1) {  // Increased default frame rate to 1 FPS
        this.frameRate = frameRate; // Frames per second
        this.isCapturing = false;
        this.video = null;
        this.canvas = null;
        this.stream = null;
        this.captureInterval = null;
        this.onFrameCallback = null;
        this.resolutionScale = 0.5;  // Increased resolution scale to 50%
    }
    
    /**
     * Initialize video and canvas elements
     */
    initialize() {
        // Create video element for screen capture
        this.video = document.createElement('video');
        this.video.style.display = 'none';
        document.body.appendChild(this.video);
        
        // Create canvas for processing frames
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'none';
        document.body.appendChild(this.canvas);
    }
    
    /**
     * Start capturing the screen
     * @param {Function} onFrame - Callback function that receives base64 encoded frames
     * @returns {Promise<boolean>} - True if started successfully
     */
    async startCapture(onFrame) {
        if (this.isCapturing) {
            console.log('Screen capture already in progress');
            return false;
        }
        
        if (!this.canvas || !this.video) {
            this.initialize();
        }
        
        this.onFrameCallback = onFrame;
        
        try {
            // Get available screen sources through IPC
            const sources = await ipcRenderer.invoke('get-desktop-sources');
            
            if (sources.length === 0) {
                throw new Error('No screen sources available');
            }
            
            // Use the first screen source (primary display)
            const source = sources[0];
            
            // Create constraints for the media stream
            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id
                    }
                }
            };
            
            // Get the media stream
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Connect the stream to the video element
            this.video.srcObject = this.stream;
            this.video.play();
            
            // Wait for video to be ready
            await new Promise(resolve => {
                this.video.onloadedmetadata = () => resolve();
            });
            
            // Start capturing frames
            this.isCapturing = true;
            this._startFrameCapture();
            
            console.log('Screen capture started');
            return true;
        } catch (error) {
            console.error('Failed to start screen capture:', error);
            this._cleanup();
            return false;
        }
    }
    
    /**
     * Stop capturing the screen
     */
    stopCapture() {
        this.isCapturing = false;
        
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        
        this._cleanup();
        console.log('Screen capture stopped');
    }
    
    /**
     * Clean up resources
     * @private
     */
    _cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.video) {
            this.video.srcObject = null;
        }
    }
    
    /**
     * Internal method to start capturing frames at the specified frame rate
     * @private
     */
    _startFrameCapture() {
        if (!this.isCapturing) return;
        
        const captureFrame = () => {
            if (!this.isCapturing) return;
            
            try {
                const ctx = this.canvas.getContext('2d');
                
                // Set canvas size to a higher percentage of video size for better resolution
                this.canvas.width = this.video.videoWidth * this.resolutionScale;
                this.canvas.height = this.video.videoHeight * this.resolutionScale;
                
                // Draw the current video frame to the canvas
                ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
                
                // Convert to base64 JPEG with higher quality
                const base64Data = this.canvas.toDataURL('image/jpeg', 0.9);  // Increased quality to 0.9
                
                // Extract the base64 data (remove the data URL prefix)
                const base64EncodedImage = base64Data.slice(base64Data.indexOf(',') + 1);
                
                // Send the frame via the callback
                if (this.onFrameCallback) {
                    this.onFrameCallback(base64EncodedImage);
                }
            } catch (error) {
                console.error('Error capturing frame:', error);
            }
        };
        
        // Capture frames at the specified interval
        const intervalMs = 1000 / this.frameRate;
        this.captureInterval = setInterval(captureFrame, intervalMs);
        
        // Capture the first frame immediately
        captureFrame();
    }
}

module.exports = ScreenCapture;
