/**
 * Quick Path Predictor for immediate action suggestions
 * This module provides a lightweight alternative to MCTS for generating immediate suggestions
 * based on the current workflow state, without running extensive simulations.
 */

class QuickPathPredictor {
    /**
     * Create a new Quick Path Predictor
     * @param {Object} options - Options for the predictor
     * @param {Object} options.llmManager - LLM Manager instance
     * @param {Object} options.config - Configuration options
     */
    constructor({ llmManager, config = {} }) {
        if (!llmManager) {
            throw new Error('LLM Manager is required for QuickPathPredictor');
        }
        
        this.llmManager = llmManager;
        this.config = {
            candidateLimit: 3,
            confidenceThreshold: 0.7,
            ...(config || {})
        };
    }

    /**
     * Generate immediate suggestions based on the current workflow state
     * @param {Object} state - Current workflow state
     * @returns {Promise<Object>} - Best action prediction
     */
    async predictNextAction(state) {
        console.log('Quick Path: Generating immediate suggestions');
        
        try {
            // Get candidate actions from the current state
            const actions = await this.llmManager.generateActions(state);
            
            if (!actions || actions.length === 0) {
                return {
                    action: "No action available",
                    confidence: 0,
                    reasoning: "Could not determine appropriate actions based on current context."
                };
            }
            
            console.log(`Quick Path: Generated ${actions.length} candidate actions`);
            
            // Limit to top N candidates based on config
            const topActions = actions.slice(0, this.config.candidateLimit);
            
            // For each action, do a single-step evaluation
            const evaluatedActions = await Promise.all(
                topActions.map(async (action) => {
                    // Predict the next state
                    const nextState = await this.llmManager.predictNextState(state, action);
                    
                    // Evaluate the predicted state
                    const score = await this.llmManager.evaluateState(nextState);
                    
                    return { action, score, state: nextState };
                })
            );
            
            // Find the action with the highest score
            const bestAction = evaluatedActions.reduce((best, current) => 
                current.score > best.score ? current : best, 
                { score: -1 }
            );
            
            // Calculate confidence (normalized between 0-10)
            const confidence = Math.round(bestAction.score * 10);
            
            // Generate reasoning
            const reasoning = await this.llmManager.generateReasoning(
                state,
                bestAction.action,
                confidence
            );
            
            // Generate hero text (shorter version for UI)
            const heroText = await this.llmManager.generateHeroText(
                state,
                bestAction.action,
                confidence
            );
            
            console.log(`Quick Path: Selected best action "${bestAction.action}" with confidence ${confidence}/10`);
            
            return {
                action: bestAction.action,
                state: bestAction.state,
                confidence,
                reasoning,
                heroText,
                exploredPaths: evaluatedActions.map(item => ({
                    action: item.action,
                    value: item.score.toFixed(3)
                }))
            };
        } catch (error) {
            console.error('Error in quick path prediction:', error);
            return {
                action: "Error in prediction",
                confidence: 0,
                reasoning: "An error occurred while generating predictions."
            };
        }
    }
    
    /**
     * Check if the state complexity exceeds quick path capabilities
     * @param {Object} state - Current workflow state
     * @returns {boolean} - True if state is too complex for quick path
     */
    isStateComplex(state) {
        // Implementation could consider:
        // 1. Number of possible actions
        // 2. Depth of action history
        // 3. Number of contextual elements
        // 4. Presence of conflicting priorities
        
        // For now, use a simple heuristic based on action history length
        if (state.action_history && state.action_history.length > 5) {
            return true;
        }
        
        // Check for multiple high-priority tasks
        if (state.tasks) {
            const highPriorityTasks = state.tasks.filter(task => 
                task.priority === 'High' && task.status !== 'Completed');
            
            if (highPriorityTasks.length > 2) {
                return true;
            }
        }
        
        // Check for upcoming meetings within 15 minutes
        if (state.upcoming_meetings && state.upcoming_meetings.length > 0) {
            const currentTime = state.current_time ? new Date(state.current_time) : new Date();
            
            for (const meeting of state.upcoming_meetings) {
                const meetingTime = new Date(meeting.time);
                const timeDiff = (meetingTime - currentTime) / (1000 * 60); // in minutes
                
                if (timeDiff > 0 && timeDiff <= 15) {
                    return true; // Immediate meeting context increases complexity
                }
            }
        }
        
        return false;
    }
}

module.exports = QuickPathPredictor;
