/**
 * State Manager for AI Want It That Way
 * Handles workflow state management, historical profiles, and context analysis
 */

const config = require('./config');

class StateManager {
    constructor(options = {}) {
        // Get history limits from config or options
        this.recentActionsLimit = options.recentActionsLimit || config.stateHistory.recentActionsLimit || 10;
        this.actionHistoryLimit = options.actionHistoryLimit || config.stateHistory.actionHistoryLimit || 50;
        this.actionHistoryToSend = options.actionHistoryToSend || config.stateHistory.actionHistoryToSend || 20;
        this.eventHistoryLimit = options.eventHistoryLimit || config.stateHistory.eventHistoryLimit || 5;
        // Initialize state structure
        this.currentState = {
            timestamp: Date.now(),
            screen_content: {
                visible_apps: [],
                active_window: null,
                visible_text: [],
                detected_time_elements: []
            },
            recent_actions: [],
            upcoming_events: [],
            action_history: []
        };
        
        // Historical data
        this.eventHistory = [];         // Rolling window of recent events
        this.maxEventHistory = this.eventHistoryLimit; // Store limited number of events
        this.eventFrequency = {};       // Track frequency of event types
        this.lastContextShift = null;   // Timestamp of last significant context change
        
        // Suggestion feedback tracking
        this.suggestionHistory = [];    // History of suggestions and user responses
        this.feedbackStats = {
            accepted: 0,
            rejected: 0,
            categories: {}              // Track acceptance by category
        };
    }
    
    /**
     * Update the current state with new observations
     * @param {Object} event - Structured event from Gemini client
     * @returns {boolean} - Whether this update represents a context shift
     */
    updateState(event) {
        console.log('====== STATE UPDATE STARTED ======');
        console.log('Incoming event:', JSON.stringify(event, null, 2));
        console.log('Current state before update:', JSON.stringify(this.currentState, null, 2));
        
        // Update timestamp
        this.currentState.timestamp = event.timestamp;
        
        // Process screen content updates
        if (event.detected_elements.applications.length > 0) {
            console.log('Detected applications:', event.detected_elements.applications);
            this.currentState.screen_content.visible_apps = [
                ...new Set([...this.currentState.screen_content.visible_apps, ...event.detected_elements.applications])
            ];
            
            // Assume the first detected app is the active window
            if (event.detected_elements.applications[0]) {
                const newActiveWindow = event.detected_elements.applications[0];
                
                // Check if active window has changed
                if (this.currentState.screen_content.active_window !== newActiveWindow) {
                    const previousWindow = this.currentState.screen_content.active_window;
                    this.currentState.screen_content.active_window = newActiveWindow;
                    console.log('Updated active window to:', this.currentState.screen_content.active_window);
                    
                    // Create a derived action for app switching
                    if (previousWindow) {
                        const appSwitchAction = {
                            timestamp: event.timestamp,
                            action_type: 'app_switch',
                            description: `Switched from ${previousWindow} to ${newActiveWindow}`,
                            context: {
                                app: newActiveWindow,
                                previous_app: previousWindow,
                                document: event.detected_elements.documents.length > 0 ? 
                                         event.detected_elements.documents[0] : null
                            },
                            confidence: 0.9,
                            derived: true // Mark this as a derived action
                        };
                        
                        // Add to recent_actions
                        this.currentState.recent_actions = [
                            appSwitchAction,
                            ...this.currentState.recent_actions
                        ].slice(0, this.recentActionsLimit);
                        
                        // Add to action_history (with limit)
                        this.currentState.action_history.push(appSwitchAction);
                        
                        // Trim action_history if it exceeds the limit
                        if (this.currentState.action_history.length > this.actionHistoryLimit) {
                            this.currentState.action_history = this.currentState.action_history.slice(
                                this.currentState.action_history.length - this.actionHistoryLimit
                            );
                        }
                        
                        console.log('Added derived app switch action:', appSwitchAction);
                    }
                }
            }
        }
        
        // Update time elements
        if (event.detected_elements.time_references.length > 0) {
            console.log('Detected time references:', event.detected_elements.time_references);
            this.currentState.screen_content.detected_time_elements = [
                ...new Set([...this.currentState.screen_content.detected_time_elements, ...event.detected_elements.time_references])
            ];
        }
        
        // Update upcoming events based on meeting references
        if (event.detected_elements.meetings.length > 0) {
            console.log('Detected meetings:', event.detected_elements.meetings);
            // Extract time from meeting references if available
            const meetingsWithTime = event.detected_elements.meetings.map(meeting => {
                const timeMatch = meeting.match(/(\\d{1,2}:\\d{2}(?:\\s*[AaPp][Mm])?)/); 
                return {
                    title: meeting,
                    time: timeMatch ? timeMatch[1] : null,
                    timestamp: event.timestamp
                };
            });
            
            console.log('Processed meetings with time:', meetingsWithTime);
            
            // Add to upcoming events
            this.currentState.upcoming_events = [
                ...this.currentState.upcoming_events,
                ...meetingsWithTime.filter(m => !this.currentState.upcoming_events.some(e => e.title === m.title))
            ];
        }
        
        // Process actions
        if (event.detected_elements.actions && event.detected_elements.actions.length > 0) {
            console.log('Detected actions:', event.detected_elements.actions);
            
            // Process each action
            const actionEntries = event.detected_elements.actions.map(action => {
                return {
                    timestamp: event.timestamp,
                    action_type: this._inferActionType(action),
                    description: action,
                    context: {
                        app: this.currentState.screen_content.active_window,
                        document: event.detected_elements.documents.length > 0 ? 
                                 event.detected_elements.documents[0] : null
                    },
                    confidence: 0.8 // Default confidence for explicitly detected actions
                };
            });
            
            // Add to recent_actions with configurable limit
            this.currentState.recent_actions = [
                ...actionEntries,
                ...this.currentState.recent_actions
            ].slice(0, this.recentActionsLimit);
            
            // Add to full action_history
            this.currentState.action_history = [
                ...this.currentState.action_history,
                ...actionEntries
            ];
            
            // Trim action_history if it exceeds the limit
            if (this.currentState.action_history.length > this.actionHistoryLimit) {
                this.currentState.action_history = this.currentState.action_history.slice(
                    this.currentState.action_history.length - this.actionHistoryLimit
                );
            }
            
            console.log('Updated action history. Current length:', this.currentState.action_history.length);
            console.log('Recent actions:', JSON.stringify(this.currentState.recent_actions, null, 2));
        }
        
        // Add to event history
        this.eventHistory.push(event);
        console.log('Added event to history. Current event history length:', this.eventHistory.length);
        
        // Keep only the most recent events
        if (this.eventHistory.length > this.maxEventHistory) {
            this.eventHistory = this.eventHistory.slice(-this.maxEventHistory);
            console.log('Trimmed event history to max size:', this.maxEventHistory);
        }
        
        // Log event history
        console.log('Current event history (last 3 events):', 
                    JSON.stringify(this.eventHistory.slice(-3).map(e => {
                        return {
                            timestamp: new Date(e.timestamp).toLocaleTimeString(),
                            raw_text: e.raw_text.substring(0, 50) + (e.raw_text.length > 50 ? '...' : ''),
                            apps: e.detected_elements.applications,
                            meetings: e.detected_elements.meetings,
                            time_refs: e.detected_elements.time_references,
                            docs: e.detected_elements.documents
                        };
                    }), null, 2));
        
        // Update frequency counts for event types
        this._updateEventFrequency(event);
        
        // Detect if this update represents a significant context shift
        const isContextShift = this.detectContextShift(event);
        
        if (isContextShift) {
            this.lastContextShift = event.timestamp;
            console.log('CONTEXT SHIFT DETECTED at:', new Date(event.timestamp).toLocaleTimeString());
        }
        
        console.log('Updated state:', JSON.stringify(this.currentState, null, 2));
        console.log('====== STATE UPDATE COMPLETED ======');
        
        return isContextShift;
    }
    
    /**
     * Infer the action type from an action description
     * @private
     * @param {string} actionDescription - The description of the action
     * @returns {string} - The inferred action type
     */
    _inferActionType(actionDescription) {
        const description = actionDescription.toLowerCase();
        
        // Pattern matching for common action types
        if (description.includes('typing') || description.includes('writing')) {
            return 'typing';
        } else if (description.includes('reading') || description.includes('viewing')) {
            return 'reading';
        } else if (description.includes('switch') || description.includes('opening')) {
            return 'app_switch';
        } else if (description.includes('editing') || description.includes('modifying')) {
            return 'editing';
        } else if (description.includes('meeting') || description.includes('call')) {
            return 'meeting';
        } else if (description.includes('scrolling') || description.includes('browsing')) {
            return 'browsing';
        } else {
            // Default to 'other' if no pattern matches
            return 'other';
        }
    }
    
    /**
     * Update frequency counts for different event types
     * @private
     */
    _updateEventFrequency(event) {
        // Update application frequency
        event.detected_elements.applications.forEach(app => {
            const key = `app:${app}`;
            this.eventFrequency[key] = (this.eventFrequency[key] || 0) + 1;
        });
        
        // Update meeting reference frequency
        event.detected_elements.meetings.forEach(meeting => {
            const key = `meeting:${meeting.toLowerCase()}`;
            this.eventFrequency[key] = (this.eventFrequency[key] || 0) + 1;
        });
        
        // Update action frequency
        event.detected_elements.actions.forEach(action => {
            const actionType = this._inferActionType(action);
            const key = `action:${actionType}`;
            this.eventFrequency[key] = (this.eventFrequency[key] || 0) + 1;
        });
        
        // Can add more event type frequencies as needed
    }
    
    /**
     * Record user feedback on a suggestion
     * @param {Object} suggestion - The suggestion that was shown to the user
     * @param {boolean} accepted - Whether the user accepted the suggestion
     */
    recordFeedback(suggestion, accepted) {
        // Add to suggestion history
        this.suggestionHistory.push({
            suggestion,
            accepted,
            timestamp: Date.now()
        });
        
        // Update feedback stats
        if (accepted) {
            this.feedbackStats.accepted++;
            
            // Increment category counter
            if (suggestion.category) {
                this.feedbackStats.categories[suggestion.category] = 
                    (this.feedbackStats.categories[suggestion.category] || 0) + 1;
            }
        } else {
            this.feedbackStats.rejected++;
            
            // Decrement category counter (but keep it non-negative)
            if (suggestion.category) {
                this.feedbackStats.categories[suggestion.category] = 
                    Math.max(0, (this.feedbackStats.categories[suggestion.category] || 0) - 0.5);
            }
        }
        
        // If the suggestion was based on a specific event type, update its frequency
        if (suggestion.eventType) {
            const frequency = this.eventFrequency[suggestion.eventType] || 0;
            
            // Increase or decrease the frequency based on feedback
            this.eventFrequency[suggestion.eventType] = accepted 
                ? frequency + 1 
                : Math.max(0, frequency - 0.5);
        }
    }
    
    /**
     * Detect if an event represents a significant context shift
     * @param {Object} event - The new event to evaluate
     * @returns {boolean} - True if this event represents a context shift
     */
    detectContextShift(event) {
        if (!this.lastContextShift) {
            // First event is always a context shift
            return true;
        }
        
        // Time-based threshold - don't trigger shifts too frequently
        const minTimeBetweenShifts = 60000; // 1 minute in milliseconds
        if (event.timestamp - this.lastContextShift < minTimeBetweenShifts) {
            return false;
        }
        
        // Define significance criteria
        const isSignificant = (
            // New meeting detected
            event.detected_elements.meetings.length > 0 ||
            
            // New time reference that might indicate a deadline or upcoming event
            event.detected_elements.time_references.length > 0 ||
            
            // Application change
            (event.detected_elements.applications.length > 0 && 
             !this.currentState.screen_content.visible_apps.includes(event.detected_elements.applications[0]))
        );
        
        return isSignificant;
    }
    
    /**
     * Get current state plus relevant historical context
     * @returns {Object} - Enhanced state object with historical context
     */
    getEnhancedState() {
        // Create a copy of the current state
        const enhancedState = { ...this.currentState };
        
        // Limit action_history in the returned state to conserve context window
        if (enhancedState.action_history && enhancedState.action_history.length > this.actionHistoryToSend) {
            enhancedState.action_history = enhancedState.action_history.slice(-this.actionHistoryToSend);
        }
        
        return {
            ...enhancedState,
            
            // Add relevant historical context
            historical_context: {
                frequent_apps: this._getTopFrequentItems('app:', 3),
                frequent_meetings: this._getTopFrequentItems('meeting:', 3),
                frequent_actions: this._getTopFrequentItems('action:', 3),
                feedback_stats: this.feedbackStats
            }
        };
    }
    
    /**
     * Get top frequent items by prefix
     * @private
     */
    _getTopFrequentItems(prefix, limit) {
        // Filter keys by prefix and sort by frequency
        return Object.entries(this.eventFrequency)
            .filter(([key]) => key.startsWith(prefix))
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([key, count]) => ({
                name: key.substring(prefix.length),
                count
            }));
    }
    
    /**
     * Serialize the current state to JSON
     * @returns {string} - JSON string of the current state
     */
    serializeState() {
        return JSON.stringify(this.currentState);
    }
    
    /**
     * Deserialize state from JSON
     * @param {string} jsonState - JSON string to parse
     */
    deserializeState(jsonState) {
        try {
            this.currentState = JSON.parse(jsonState);
        } catch (error) {
            console.error('Error deserializing state:', error);
        }
    }
    
    /**
     * Reset the state to initial values
     */
    resetState() {
        this.currentState = {
            timestamp: Date.now(),
            screen_content: {
                visible_apps: [],
                active_window: null,
                visible_text: [],
                detected_time_elements: []
            },
            recent_actions: [],
            upcoming_events: [],
            action_history: []
        };
        
        this.eventHistory = [];
        this.lastContextShift = null;
    }
}

module.exports = StateManager;
