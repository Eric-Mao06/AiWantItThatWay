/**
 * Gemini API client for screen streaming
 * This module handles WebSocket communication with Gemini's API
 * and integrates with InferenceController for generating suggestions
 */

const StateManager = require('./state-manager');
const LLMManager = require('./llm-manager');
const InferenceController = require('./inference-controller');

class GeminiClient {
    constructor(apiKey, openaiApiKey, groqApiKey, config = {}) {
        this.apiKey = apiKey;
        this.openaiApiKey = openaiApiKey;
        this.groqApiKey = groqApiKey;
        this.ws = null;
        this.isConnected = false;
        this.eventListeners = {
            'open': [],
            'close': [],
            'error': [],
            'content': [],
            'interrupted': [],
            'audio': [],
            'state_updated': [],
            'context_shift': [],
            'suggestion': []  // New event for suggestions
        };
        
        // Buffer for accumulating partial JSON responses
        this.jsonAccumulationBuffer = '';
        this.isAccumulatingJson = false;
        this.jsonTimeoutId = null;
        this.JSON_ACCUMULATION_TIMEOUT = 5000; // 5 seconds timeout for JSON accumulation
        
        // Default configuration
        this.config = {
            suggestionInterval: 20000,  // Generate suggestions every 30 seconds by default
            performanceMode: 'balanced', // Performance mode for inference controller
            ...config
        };
        
        // Initialize the state manager
        this.stateManager = new StateManager();
        
        // Initialize the LLM manager
        this.llmManager = new LLMManager({
            openaiApiKey: this.openaiApiKey,
            groqApiKey: this.groqApiKey
        });
        
        // Initialize the inference controller
        this.inferenceController = new InferenceController({
            llmManager: this.llmManager,
            stateManager: this.stateManager,
            config: {
                performanceMode: this.config.performanceMode,
                mctsSimulations: this.config.mctsSimulations || 10,
                contextThreshold: this.config.contextThreshold || 0.6
            }
        });
        
        // Timer for periodic suggestions
        this.suggestionTimer = null;
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
                    
                    // Process the observation and update state
                    const processedEvent = this.processObservation(allText);
                    this._processObservation(processedEvent);
                }
                
                this._emitEvent('content', { parts });
                return;
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    /**
     * Process a text observation from Gemini into structured events
     * @param {string} text - Raw text observation from Gemini
     * @returns {Object} - Structured event object
     */
    processObservation(text) {
        // Check if the text might be JSON or part of JSON
        const jsonIndicators = [
            text.includes('{'),
            text.includes('}'),
            text.includes('"'),
            text.includes(':'),
            text.trim().startsWith('json')
        ];
        
        const mightBeJson = jsonIndicators.some(indicator => indicator);
        
        // Handle potential JSON responses that are split across multiple calls
        if (mightBeJson) {
            console.log('Detected potential JSON fragment:', text.substring(0, 50) + '...');
            
            // Add current text to the buffer
            this.jsonAccumulationBuffer += text;
            
            // Restart the timeout
            if (this.jsonTimeoutId) {
                clearTimeout(this.jsonTimeoutId);
            }
            
            // Setup a timeout to process the buffer if no more chunks arrive
            this.jsonTimeoutId = setTimeout(() => {
                console.log('JSON accumulation timeout reached, processing buffer...');
                const processedEvent = this._processAccumulatedJson();
                this._processObservation(processedEvent);
                
                // Reset the buffer
                this.jsonAccumulationBuffer = '';
                this.isAccumulatingJson = false;
                this.jsonTimeoutId = null;
            }, this.JSON_ACCUMULATION_TIMEOUT);
            
            // Mark that we're currently accumulating JSON
            this.isAccumulatingJson = true;
            
            // Try to process the buffer to see if we have a complete JSON object
            try {
                // Find what looks like a complete JSON object
                const firstBrace = this.jsonAccumulationBuffer.indexOf('{');
                const lastBrace = this.jsonAccumulationBuffer.lastIndexOf('}');
                
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    const jsonText = this.jsonAccumulationBuffer.substring(firstBrace, lastBrace + 1);
                    
                    // Try to parse it - if it succeeds, we have a complete JSON object
                    const parsed = JSON.parse(jsonText);
                    
                    console.log('Successfully parsed accumulated JSON:', parsed);
                    
                    // We have a complete JSON, clear the timeout
                    if (this.jsonTimeoutId) {
                        clearTimeout(this.jsonTimeoutId);
                        this.jsonTimeoutId = null;
                    }
                    
                    // Reset the buffer
                    this.jsonAccumulationBuffer = '';
                    this.isAccumulatingJson = false;
                    
                    // Create the observation event
                    const event = {
                        timestamp: Date.now(),
                        raw_text: parsed.description || text,
                        detected_elements: {
                            applications: Array.isArray(parsed.applications) ? [...parsed.applications] : [],
                            time_references: Array.isArray(parsed.time_references) ? [...parsed.time_references] : [],
                            actions: Array.isArray(parsed.actions) ? [...parsed.actions] : [],
                            meetings: Array.isArray(parsed.meetings) ? [...parsed.meetings] : [],
                            documents: Array.isArray(parsed.documents) ? [...parsed.documents] : []
                        }
                    };
                    
                    console.log('Processed complete JSON observation:', event);
                    return event;
                }
            } catch (error) {
                // If we can't parse a complete JSON yet, keep accumulating
                console.log('Still accumulating JSON chunks, not complete yet:', error.message);
            }
            
            // If we're accumulating JSON but don't have a complete object yet,
            // return a minimal event for this chunk
            if (this.isAccumulatingJson) {
                const accumulationEvent = {
                    timestamp: Date.now(),
                    raw_text: text,
                    detected_elements: {
                        applications: [],
                        time_references: [],
                        actions: [],
                        meetings: [],
                        documents: []
                    },
                    isPartialJson: true  // Mark that this is a partial JSON chunk
                };
                return accumulationEvent;
            }
        }
        
        // If we're not dealing with JSON or JSON accumulation failed, create a standard event
        const event = {
            timestamp: Date.now(),
            raw_text: text,
            detected_elements: {
                applications: [],
                time_references: [],
                actions: [],
                meetings: [],
                documents: []
            }
        };
        
        // Fall back to the regex approach for non-JSON text
        // First try to parse as JSON one more time just to be safe
        try {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const jsonText = text.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(jsonText);
                
                // Handle structured response format
                if (parsed) {
                    // Add description to raw text for context
                    if (parsed.description) {
                        event.raw_text = parsed.description;
                    }
                    
                    // Copy over the structured data elements
                    if (Array.isArray(parsed.applications)) {
                        event.detected_elements.applications = [...parsed.applications];
                    }
                    
                    if (Array.isArray(parsed.time_references)) {
                        event.detected_elements.time_references = [...parsed.time_references];
                    }
                    
                    if (Array.isArray(parsed.documents)) {
                        event.detected_elements.documents = [...parsed.documents];
                    }
                    
                    if (Array.isArray(parsed.meetings)) {
                        event.detected_elements.meetings = [...parsed.meetings];
                    }
                    
                    if (Array.isArray(parsed.actions)) {
                        event.detected_elements.actions = [...parsed.actions];
                    }
                    
                    // Successfully parsed JSON, return the event
                    console.log('Successfully parsed structured JSON response:', event);
                    return event;
                }
            }
        } catch (error) {
            // If JSON parsing fails, fall back to the original regex approach
            console.log('Falling back to regex extraction for non-JSON text');
        }
        
        // Fall back to extracting information using regex patterns if JSON parsing failed
        
        // Extract application references
        const appPatterns = [
            /(?:using|on|in)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)/g,
            /([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)\s+(?:window|application|app|interface)/g
        ];
        
        for (const pattern of appPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const app = match[1].trim();
                if (!event.detected_elements.applications.includes(app)) {
                    event.detected_elements.applications.push(app);
                }
            }
        }
        
        // Extract time references
        const timePatterns = [
            /(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/g,  // Time format like 3:30PM
            /([Tt]oday|[Tt]omorrow|[Nn]ext\s+\w+)\s+(?:at)?\s*(\d{1,2}(?::\d{2})?(?:\s*[AaPp][Mm])?)?/g, // Today/Tomorrow references
            /(in\s+\d+\s+(?:minute|hour|day)s?)/g,  // Relative time like "in 5 minutes"
            /(\d+\s+(?:minute|hour|day)s?\s+(?:from\s+now|left|remaining))/g // Time remaining
        ];
        
        for (const pattern of timePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const timeRef = match[0].trim();
                if (!event.detected_elements.time_references.includes(timeRef)) {
                    event.detected_elements.time_references.push(timeRef);
                }
            }
        }
        
        // Extract meeting references
        const meetingPatterns = [
            /meeting\s+(?:with|about)?\s+(\w[\w\s]*?)(?:\s+at|\s+on|\s+in|\.|,|$)/gi,
            /([Cc]all|[Cc]onference|[Vv]ideo\s+call)\s+(?:with|about)?\s+(\w[\w\s]*?)(?:\s+at|\s+on|\s+in|\.|,|$)/g
        ];
        
        for (const pattern of meetingPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const meetingRef = match[0].trim();
                if (!event.detected_elements.meetings.includes(meetingRef)) {
                    event.detected_elements.meetings.push(meetingRef);
                }
            }
        }
        
        // Extract document references
        const documentPatterns = [
            /([a-zA-Z0-9_-]+\.(docx?|pdf|xlsx?|pptx?|txt|md|css|js|html|json|csv))/gi,
            /(document|file|spreadsheet|presentation)\s+["']([^"']+)["']/gi
        ];
        
        for (const pattern of documentPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const docRef = match[1] || match[2];
                if (docRef && !event.detected_elements.documents.includes(docRef)) {
                    event.detected_elements.documents.push(docRef);
                }
            }
        }
        
        console.log('Processed observation with regex approach:', event);
        return event;
    }
    
    /**
     * Get the current enhanced state
     * @returns {Object} - Current state object with historical context
     */
    getState() {
        return this.stateManager.getEnhancedState();
    }
    
    /**
     * Reset the state to initial values
     */
    resetState() {
        this.stateManager.resetState();
        this._emitEvent('state_updated', this.stateManager.getEnhancedState());
    }
    
    /**
     * Record user feedback on a suggestion
     * @param {Object} suggestion - The suggestion that was shown to the user
     * @param {boolean} accepted - Whether the user accepted the suggestion
     * @param {string} feedback - Optional user feedback
     */
    recordFeedback(suggestion, accepted, feedback = '') {
        this.stateManager.recordFeedback(suggestion, accepted, feedback);
        
        // Use the feedback to improve future predictions
        if (accepted) {
            // If suggestion was accepted, it's a good signal for training
            console.log(`User accepted suggestion: "${suggestion.action}"`); 
        } else {
            // If suggestion was rejected, it's a useful signal as well
            console.log(`User rejected suggestion: "${suggestion.action}"${feedback ? ` with feedback: ${feedback}` : ''}`);
        }
    }
    
    /**
     * Close the WebSocket connection
     */
    close() {
        // Clear the suggestion timer
        this._clearSuggestionTimer();
        
        // Close the WebSocket
        if (this.ws) {
            this.ws.close();
        }
    }
    
    /**
     * Process the accumulated JSON buffer
     * @private
     * @returns {Object} - Processed observation event
     */
    _processAccumulatedJson() {
        console.log('Processing accumulated JSON buffer:', this.jsonAccumulationBuffer.substring(0, 50) + '...');
        
        const event = {
            timestamp: Date.now(),
            raw_text: this.jsonAccumulationBuffer,
            detected_elements: {
                applications: [],
                time_references: [],
                actions: [],
                meetings: [],
                documents: []
            }
        };
        
        try {
            // Find what looks like a complete JSON object
            const firstBrace = this.jsonAccumulationBuffer.indexOf('{');
            const lastBrace = this.jsonAccumulationBuffer.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const jsonText = this.jsonAccumulationBuffer.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(jsonText);
                
                console.log('Successfully parsed accumulated JSON with timeout:', parsed);
                
                // Create the observation event from parsed JSON
                event.raw_text = parsed.description || this.jsonAccumulationBuffer;
                
                // Copy over the structured data elements
                if (Array.isArray(parsed.applications)) {
                    event.detected_elements.applications = [...parsed.applications];
                }
                
                if (Array.isArray(parsed.time_references)) {
                    event.detected_elements.time_references = [...parsed.time_references];
                }
                
                if (Array.isArray(parsed.documents)) {
                    event.detected_elements.documents = [...parsed.documents];
                }
                
                if (Array.isArray(parsed.meetings)) {
                    event.detected_elements.meetings = [...parsed.meetings];
                }
                
                return event;
            }
        } catch (error) {
            console.log('Failed to parse accumulated JSON, falling back to regex:', error.message);
        }
        
        // If JSON parsing fails, fall back to regex extraction
        // Extract application references
        const appPatterns = [
            /(?:using|on|in)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)/g,
            /([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)\s+(?:window|application|app|interface)/g
        ];
        
        for (const pattern of appPatterns) {
            let match;
            while ((match = pattern.exec(this.jsonAccumulationBuffer)) !== null) {
                const app = match[1].trim();
                if (!event.detected_elements.applications.includes(app)) {
                    event.detected_elements.applications.push(app);
                }
            }
        }
        
        // Extract time references
        const timePatterns = [
            /(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/g,  // Time format like 3:30PM
            /([Tt]oday|[Tt]omorrow|[Nn]ext\s+\w+)\s+(?:at)?\s*(\d{1,2}(?::\d{2})?(?:\s*[AaPp][Mm])?)?/g, // Today/Tomorrow references
            /(in\s+\d+\s+(?:minute|hour|day)s?)/g,  // Relative time like "in 5 minutes"
            /(\d+\s+(?:minute|hour|day)s?\s+(?:from\s+now|left|remaining))/g // Time remaining
        ];
        
        for (const pattern of timePatterns) {
            let match;
            while ((match = pattern.exec(this.jsonAccumulationBuffer)) !== null) {
                const timeRef = match[0].trim();
                if (!event.detected_elements.time_references.includes(timeRef)) {
                    event.detected_elements.time_references.push(timeRef);
                }
            }
        }
        
        // Extract meeting references
        const meetingPatterns = [
            /meeting\s+(?:with|about)?\s+(\w[\w\s]*?)(?:\s+at|\s+on|\s+in|\.|,|$)/gi,
            /([Cc]all|[Cc]onference|[Vv]ideo\s+call)\s+(?:with|about)?\s+(\w[\w\s]*?)(?:\s+at|\s+on|\s+in|\.|,|$)/g
        ];
        
        for (const pattern of meetingPatterns) {
            let match;
            while ((match = pattern.exec(this.jsonAccumulationBuffer)) !== null) {
                const meetingRef = match[0].trim();
                if (!event.detected_elements.meetings.includes(meetingRef)) {
                    event.detected_elements.meetings.push(meetingRef);
                }
            }
        }
        
        // Extract document references
        const documentPatterns = [
            /([a-zA-Z0-9_-]+\.(docx?|pdf|xlsx?|pptx?|txt|md|css|js|html|json|csv))/gi,
            /(document|file|spreadsheet|presentation)\s+["']([^"']+)["']/gi
        ];
        
        for (const pattern of documentPatterns) {
            let match;
            while ((match = pattern.exec(this.jsonAccumulationBuffer)) !== null) {
                const docRef = match[1] || match[2];
                if (docRef && !event.detected_elements.documents.includes(docRef)) {
                    event.detected_elements.documents.push(docRef);
                }
            }
        }
        
        console.log('Processed accumulated buffer with regex approach:', event);
        return event;
    }
    
    /**
     * Process an observation event to update the state
     * @private
     * @param {Object} observation - Observation event
     */
    _processObservation(observation) {
        // Skip partial JSON chunks as they're just being accumulated
        if (observation.isPartialJson) {
            console.log('Skipping partial JSON chunk from being processed as an observation');
            return;
        }
        
        // Update state based on the observation
        const isContextShift = this.stateManager.updateState(observation);
        
        // Emit state updated event
        this._emitEvent('state_updated', {
            state: this.stateManager.getEnhancedState(),
            observation: observation
        });
        
        // Check for context shifts
        if (isContextShift) {
            this._emitEvent('context_shift', {
                currentState: this.stateManager.getEnhancedState(),
                event: observation
            });
            
            // Generate a suggestion immediately when context shifts
            this._generateSuggestion({ forceMCTS: true });
        }
        
        // Setup periodic suggestion generation if not already running
        if (!this.suggestionTimer && this.config.suggestionInterval > 0) {
            this._setupSuggestionTimer();
        }
    }
    
    /**
     * Setup timer for periodic suggestion generation
     */
    _setupSuggestionTimer() {
        // Clear any existing timer
        this._clearSuggestionTimer();
        
        // Set up new timer
        this.suggestionTimer = setInterval(() => {
            this._generateSuggestion();
        }, this.config.suggestionInterval);
        
        console.log(`Set up suggestion timer with interval ${this.config.suggestionInterval}ms`);
    }
    
    /**
     * Clear the suggestion timer
     */
    _clearSuggestionTimer() {
        if (this.suggestionTimer) {
            clearInterval(this.suggestionTimer);
            this.suggestionTimer = null;
        }
    }
    
    /**
     * Generate a suggestion based on current state
     * @param {Object} options - Options for suggestion generation
     */
    async _generateSuggestion(options = {}) {
        if (!this.stateManager.getEnhancedState()) {
            console.log('Skipping suggestion generation - no valid state available');
            return;
        }
        
        try {

            console.log('Generating suggestion based on current state');
            const currentState = this.stateManager.getEnhancedState();
            
            // Use the inference controller to determine the best suggestion
            const suggestion = await this.inferenceController.generateSuggestion(currentState, options);
            
            console.log(`Generated suggestion: ${suggestion.action} (confidence: ${suggestion.confidence}/10)`);
            console.log(`Method used: ${suggestion.predictionMethod}, execution time: ${suggestion.executionTime}ms`);
            
            // Emit suggestion event
            this._emitEvent('suggestion', suggestion);
            
            return suggestion;
        } catch (error) {
            console.error('Error generating suggestion:', error);
        }
    }
    
    /**
     * Manually trigger a suggestion generation
     * @param {Object} options - Options for suggestion generation
     * @returns {Promise<Object>} - The generated suggestion
     */
    async generateSuggestion(options = {}) {
        return await this._generateSuggestion(options);
    }
    
    /**
     * Update configuration settings
     * @param {Object} newConfig - New configuration settings
     */
    updateConfig(newConfig) {
        this.config = {
            ...this.config,
            ...newConfig
        };
        
        // Update inference controller config if needed
        if (newConfig.performanceMode) {
            this.inferenceController.updateConfig({
                performanceMode: newConfig.performanceMode
            });
        }
        
        // Reset suggestion timer if interval changed
        if (newConfig.suggestionInterval !== undefined) {
            this._clearSuggestionTimer();
            
            if (this.config.suggestionInterval > 0) {
                this._setupSuggestionTimer();
            }
        }
    }
}

module.exports = GeminiClient;
