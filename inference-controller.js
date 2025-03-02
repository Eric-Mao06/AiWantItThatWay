/**
 * Inference Controller
 * This module manages dynamic selection between MCTS and quick path prediction
 * based on context shifts and state complexity.
 */

const { MCTSPredictor } = require('./mcts');
const QuickPathPredictor = require('./quick-path-predictor');

class InferenceController {
    /**
     * Create a new Inference Controller
     * @param {Object} options - Options for the controller
     * @param {Object} options.llmManager - LLM Manager instance
     * @param {Object} options.stateManager - State Manager instance (optional)
     * @param {Object} options.config - Configuration options
     */
    constructor({ llmManager, stateManager = null, config = {} }) {
        if (!llmManager) {
            throw new Error('LLM Manager is required for InferenceController');
        }
        
        this.llmManager = llmManager;
        this.stateManager = stateManager;
        
        // Merge default config with provided config
        this.config = {
            // Default configuration
            contextShiftThreshold: 0.4,    // Threshold for considering a context shift significant
            performanceMode: 'balanced',    // Options: 'performance', 'quality', 'balanced'
            complexityThreshold: 0.6,       // Threshold for state complexity
            mctsConfig: {                   // Configuration for MCTS
                max_iterations: 25,         // Default iterations
                max_simulation_depth: 4,    // Default simulation depth
                exploration_weight: 1.0     // Default exploration weight
            },
            quickPathConfig: {              // Configuration for quick path
                candidateLimit: 3,          // Number of candidate actions to evaluate
                confidenceThreshold: 0.7    // Confidence threshold for quick path suggestions
            },
            ...(config || {})
        };
        
        // Initialize predictors
        this.mctsPredictor = new MCTSPredictor({
            llmManager: this.llmManager,
            config: this.config.mctsConfig
        });
        
        this.quickPathPredictor = new QuickPathPredictor({
            llmManager: this.llmManager,
            config: this.config.quickPathConfig
        });
        
        // Track recent predictions
        this.recentPredictions = [];
        this.maxRecentPredictions = 10;
    }
    
    /**
     * Generate next action suggestions based on the current workflow state
     * @param {Object} state - Current workflow state
     * @param {Object} options - Additional options for prediction
     * @returns {Promise<Object>} - Prediction result
     */
    async generateSuggestion(state, options = {}) {
        const startTime = Date.now();
        console.log('Inference Controller: Generating suggestion for workflow state');
        
        // Determine if a context shift has occurred
        const hasContextShift = this._detectContextShift(state);
        
        // Determine if the state is complex enough to warrant MCTS
        const isComplex = this._isStateComplex(state);
        
        // Decide which predictor to use
        let useMCTS = false;
        
        // Performance mode selection logic
        switch (this.config.performanceMode) {
            case 'performance':
                // Prioritize speed, only use MCTS for very complex states with context shifts
                useMCTS = isComplex && hasContextShift;
                break;
                
            case 'quality':
                // Prioritize quality, use MCTS unless state is very simple
                useMCTS = isComplex || hasContextShift;
                break;
                
            case 'balanced':
            default:
                // Balance between performance and quality
                useMCTS = isComplex || (hasContextShift && !this._isUrgent(state));
                break;
        }
        
        // Override with options if provided
        if (options.forceMCTS !== undefined) {
            useMCTS = options.forceMCTS;
        }
        
        let result;
        
        if (useMCTS) {
            console.log('Inference Controller: Using MCTS prediction (complex state or context shift)');
            result = await this.mctsPredictor.find_best_action(state);
            result.predictionMethod = 'mcts';
        } else {
            console.log('Inference Controller: Using quick path prediction (simple state)');
            result = await this.quickPathPredictor.predictNextAction(state);
            result.predictionMethod = 'quick-path';
        }
        
        // Track this prediction
        this._trackPrediction({
            timestamp: new Date().toISOString(),
            state: { ...state },
            result: { ...result },
            executionTime: Date.now() - startTime,
            usedMCTS: useMCTS
        });
        
        // Add metadata to the result
        result.executionTime = Date.now() - startTime;
        result.reason = useMCTS ? 
            'Used Monte Carlo Tree Search for deeper analysis of complex state' : 
            'Used quick path prediction for immediate actionable suggestions';
        
        return result;
    }
    
    /**
     * Detect if a significant context shift has occurred
     * @param {Object} state - Current workflow state
     * @returns {boolean} - True if a context shift is detected
     */
    _detectContextShift(state) {
        if (this.recentPredictions.length === 0) {
            return true; // First prediction is always a new context
        }
        
        // Get the most recent prediction
        const lastPrediction = this.recentPredictions[this.recentPredictions.length - 1];
        const lastState = lastPrediction.state;
        
        // Simple detection based on application changes
        if (lastState.active_application !== state.active_application) {
            return true;
        }
        
        // Detection based on time difference
        if (lastState.current_time && state.current_time) {
            const lastTime = new Date(lastState.current_time);
            const currentTime = new Date(state.current_time);
            const minutesDiff = (currentTime - lastTime) / (1000 * 60);
            
            if (minutesDiff > 15) {
                return true; // Significant time has passed
            }
        }
        
        // Detection based on changes in upcoming meetings
        if (lastState.upcoming_meetings && state.upcoming_meetings) {
            const lastMeetingCount = lastState.upcoming_meetings.length;
            const currentMeetingCount = state.upcoming_meetings.length;
            
            if (lastMeetingCount !== currentMeetingCount) {
                return true; // Meeting schedule has changed
            }
        }
        
        // Detection based on tasks
        if (lastState.tasks && state.tasks) {
            const lastHighPriorityCount = lastState.tasks.filter(t => t.priority === 'High').length;
            const currentHighPriorityCount = state.tasks.filter(t => t.priority === 'High').length;
            
            if (lastHighPriorityCount !== currentHighPriorityCount) {
                return true; // Priority landscape has changed
            }
        }
        
        return false;
    }
    
    /**
     * Determine if the current state is complex
     * @param {Object} state - Current workflow state
     * @returns {boolean} - True if the state is complex
     */
    _isStateComplex(state) {
        // Delegate to QuickPathPredictor's complexity detection
        return this.quickPathPredictor.isStateComplex(state);
    }
    
    /**
     * Determine if the current situation is urgent and requires immediate action
     * @param {Object} state - Current workflow state
     * @returns {boolean} - True if the situation is urgent
     */
    _isUrgent(state) {
        // Check for imminent meetings
        if (state.upcoming_meetings && state.upcoming_meetings.length > 0) {
            const currentTime = state.current_time ? new Date(state.current_time) : new Date();
            
            for (const meeting of state.upcoming_meetings) {
                const meetingTime = new Date(meeting.time);
                const timeDiff = (meetingTime - currentTime) / (1000 * 60); // in minutes
                
                if (timeDiff > 0 && timeDiff <= 5) {
                    return true; // Meeting within 5 minutes
                }
            }
        }
        
        // Check for urgent tasks
        if (state.tasks) {
            for (const task of state.tasks) {
                if (task.priority === 'High' && task.status !== 'Completed') {
                    const deadline = new Date(task.deadline);
                    const currentTime = state.current_time ? new Date(state.current_time) : new Date();
                    const timeDiff = (deadline - currentTime) / (1000 * 60); // in minutes
                    
                    if (timeDiff > 0 && timeDiff <= 30) {
                        return true; // High priority task due within 30 minutes
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * Track a prediction for future context shift detection
     * @param {Object} prediction - Prediction data to track
     */
    _trackPrediction(prediction) {
        this.recentPredictions.push(prediction);
        
        // Keep only the most recent predictions
        if (this.recentPredictions.length > this.maxRecentPredictions) {
            this.recentPredictions.shift();
        }
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
        
        // Update predictor configurations if needed
        if (newConfig.mctsConfig) {
            this.mctsPredictor.config = {
                ...this.mctsPredictor.config,
                ...newConfig.mctsConfig
            };
        }
        
        if (newConfig.quickPathConfig) {
            this.quickPathPredictor.config = {
                ...this.quickPathPredictor.config,
                ...newConfig.quickPathConfig
            };
        }
    }
    
    /**
     * Get prediction statistics
     * @returns {Object} - Statistics about recent predictions
     */
    getPredictionStats() {
        if (this.recentPredictions.length === 0) {
            return {
                totalPredictions: 0,
                mctsPredictions: 0,
                quickPathPredictions: 0,
                averageExecutionTime: 0
            };
        }
        
        const mctsPredictions = this.recentPredictions.filter(p => p.usedMCTS).length;
        const totalExecutionTime = this.recentPredictions.reduce((sum, p) => sum + p.executionTime, 0);
        
        return {
            totalPredictions: this.recentPredictions.length,
            mctsPredictions,
            quickPathPredictions: this.recentPredictions.length - mctsPredictions,
            averageExecutionTime: totalExecutionTime / this.recentPredictions.length
        };
    }
}

module.exports = InferenceController;
