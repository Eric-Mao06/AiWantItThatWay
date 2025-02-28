/**
 * Gemini API client for screen streaming
 * This module handles WebSocket communication with Gemini's API
 */

class GeminiClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.ws = null;
        this.isConnected = false;
        this.eventListeners = {
            'open': [],
            'close': [],
            'error': [],
            'content': [],
            'interrupted': [],
            'audio': []
        };
    }

    /**
     * Connect to Gemini's WebSocket API
     * @param {Object} config - Configuration for the Gemini model
     * @returns {Promise<boolean>} - True if connected successfully
     */
    async connect(config = {}) {
        // Default configuration
        const defaultConfig = {
            model: "models/gemini-2.0-flash-exp",
            generation_config: {
                response_modalities: ["TEXT"]
            }
        };
        
        const finalConfig = { ...defaultConfig, ...config };
        
        // Construct WebSocket URL with API key
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);
                
                this.ws.addEventListener('open', (event) => {
                    console.log('Connected to Gemini API');
                    this.isConnected = true;
                    
                    // Send setup message
                    const setupMessage = {
                        setup: finalConfig
                    };
                    this._sendDirect(setupMessage);
                    
                    this._emitEvent('open', event);
                    resolve(true);
                });
                
                this.ws.addEventListener('message', async (event) => {
                    if (event.data instanceof Blob) {
                        this._handleMessage(event.data);
                    } else {
                        console.log('Received non-blob message:', event.data);
                    }
                });
                
                this.ws.addEventListener('close', (event) => {
                    console.log('Disconnected from Gemini API');
                    this.isConnected = false;
                    this._emitEvent('close', event);
                });
                
                this.ws.addEventListener('error', (event) => {
                    console.error('WebSocket error:', event);
                    this._emitEvent('error', event);
                    reject(new Error('WebSocket connection error'));
                });
            } catch (error) {
                console.error('Failed to connect to Gemini API:', error);
                reject(error);
            }
        });
    }
    
    /**
     * Disconnect from Gemini's WebSocket API
     */
    disconnect() {
        if (this.ws && this.isConnected) {
            this.ws.close();
            this.isConnected = false;
            console.log('Disconnected from Gemini API');
            return true;
        }
        return false;
    }
    
    /**
     * Send screen capture data to Gemini
     * @param {string} base64Data - Base64 encoded JPEG image
     */
    sendScreenCapture(base64Data) {
        if (!this.isConnected || !this.ws) {
            console.error('Not connected to Gemini API');
            return false;
        }
        
        // Send as realtime input
        const message = {
            realtimeInput: {
                mediaChunks: [
                    {
                        mimeType: "image/jpeg",
                        data: base64Data
                    }
                ]
            }
        };
        
        this._sendDirect(message);
        return true;
    }
    
    /**
     * Send text message to Gemini
     * @param {string} text - Text message to send
     * @param {boolean} turnComplete - Whether this completes the user's turn
     */
    sendText(text, turnComplete = true) {
        if (!this.isConnected || !this.ws) {
            console.error('Not connected to Gemini API');
            return false;
        }
        
        const message = {
            clientContent: {
                turns: [
                    {
                        role: "user",
                        parts: [{ text }]
                    }
                ],
                turnComplete
            }
        };
        
        this._sendDirect(message);
        return true;
    }
    
    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
        return this;
    }
    
    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    off(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
        }
        return this;
    }
    
    /**
     * Internal method to emit events
     * @private
     */
    _emitEvent(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => callback(data));
        }
    }
    
    /**
     * Internal method to send data through WebSocket
     * @private
     */
    _sendDirect(data) {
        if (!this.ws || !this.isConnected) {
            throw new Error('WebSocket is not connected');
        }
        
        const jsonString = JSON.stringify(data);
        
        try {
            this.ws.send(jsonString);
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
        }
    }
    
    /**
     * Internal method to handle incoming messages
     * @private
     */
    async _handleMessage(blob) {
        try {
            const text = await blob.text();
            const data = JSON.parse(text);
            
            // Handle setup complete message
            if (data.setupComplete) {
                return;
            }
            
            // Handle interrupted message
            if (data.serverContent && data.serverContent.interrupted) {
                return;
            }
            
            // Handle model turn message
            if (data.serverContent && data.serverContent.modelTurn) {
                const { parts } = data.serverContent.modelTurn;
                
                // Check for audio data
                const audioParts = parts.filter(part => part.inlineData && 
                                               part.inlineData.mimeType && 
                                               part.inlineData.mimeType.startsWith('audio/'));
                
                if (audioParts.length > 0) {
                    audioParts.forEach(part => {
                        this._emitEvent('audio', {
                            data: part.inlineData.data,
                            mimeType: part.inlineData.mimeType
                        });
                    });
                }
                
                // Extract text from parts and print as is
                const allText = parts.filter(part => part.text).map(part => part.text).join('');
                if (allText) {
                    console.log(allText);
                }
                
                this._emitEvent('content', { parts });
                return;
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }
}

module.exports = GeminiClient;
