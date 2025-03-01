/**
 * LLM Manager for specialized LLM instances
 * This module manages multiple LLM instances with different context windows
 * for specialized tasks in the MCTS algorithm
 */

const OpenAIClient = require('./openai-client');
const GroqClient = require('./groq-client');
const config = require('./config');

class LLMManager {
    constructor() {
        // Load API keys from config
        this.openaiApiKey = config.openaiApiKey;
        this.groqApiKey = config.groqApiKey;
        
        if (!this.openaiApiKey && !this.groqApiKey) {
            throw new Error("At least one API key (OpenAI or Groq) is required. Please set API keys in your .env file.");
        }
        
        // Create specialized LLM instances for different tasks
        this.actionGenerator = this._createLLM({
            provider: 'groq', // Using Groq for faster action generation
            model: 'llama-3.1-8b-instant',
            systemPrompt: `You are an AI assistant specialized in understanding user workflow contexts and suggesting relevant next actions.
Your task is to analyze the user's current workflow state and generate a small set of contextually relevant, actionable next steps.
Focus on practical, immediate actions the user can take based on their current context, including:
- Upcoming meetings and deadlines
- Open documents and applications
- Recent communications
- Pending tasks and their priorities

Provide your suggestions as a JSON array of clear, concise action descriptions.`,
            temperature: 0.7
        });
        
        this.statePredictor = this._createLLM({
            provider: 'groq', // Using Groq for faster state prediction
            model: 'llama-3.1-8b-instant',
            systemPrompt: `You are an AI assistant specialized in predicting how a user's workflow state will change after taking a specific action.
Your task is to analyze the current workflow state and a proposed action, then predict the resulting new state.
Consider how the action will affect:
- The active application
- Open documents
- Communication history
- Task progress
- Time progression

Maintain consistency with the user's schedule and commitments while making realistic predictions about state changes.
Return your prediction as a complete JSON object representing the new workflow state.`,
            temperature: 0.2
        });
        
        this.stateEvaluator = this._createLLM({
            provider: 'groq', // Using Groq for faster state evaluation
            model: 'llama-3.1-8b-instant',
            systemPrompt: `You are an AI assistant specialized in evaluating the quality and efficiency of user workflow states.
Your task is to analyze a workflow state and evaluate it on a scale from 0 to 1, where:
- 0 represents a highly inefficient state with poor task progression and user satisfaction
- 1 represents an optimal state with excellent task progression and user satisfaction

Consider factors such as:
- Task efficiency and progress toward deadlines
- Time management and prioritization
- Alignment with user goals and priorities
- Preparation for upcoming commitments

Return only a single decimal number between 0 and 1 representing your evaluation.`,
            temperature: 0.1
        });
        
        this.reasoningGenerator = this._createLLM({
            provider: 'groq', // Using Groq for faster reasoning generation
            model: 'llama-3.1-8b-instant',
            systemPrompt: `You are an AI assistant specialized in explaining decision rationales in clear, concise language.
Your task is to explain why a particular action is recommended for a user based on their current context.
Provide a brief, clear explanation (2-3 sentences) that highlights:
- The immediate benefits of the action
- How it addresses current priorities or upcoming deadlines
- Why it's superior to alternative actions in the current context

Your explanation should be informative yet concise, focusing on the most compelling reasons for the recommendation.`,
            temperature: 0.5
        });
    }

    /**
     * Create a new LLM instance with the specified options
     * @param {Object} options - Options for the LLM
     * @returns {OpenAIClient|GroqClient} - The LLM instance
     * @private
     */
    _createLLM(options) {
        let llm;
        
        if (options.provider === 'groq') {
            // Use Groq if specified and API key is available
            if (!this.groqApiKey) {
                console.warn('Groq API key not found, falling back to OpenAI');
                options.provider = 'openai';
            } else {
                llm = new GroqClient(this.groqApiKey, options.model, {
                    temperature: options.temperature,
                    max_tokens: options.max_tokens || 1024
                });
            }
        }
        
        // Default to OpenAI or fallback if Groq was requested but not available
        if (options.provider !== 'groq' || !llm) {
            if (!this.openaiApiKey) {
                throw new Error('OpenAI API key is required but not found');
            }
            llm = new OpenAIClient(this.openaiApiKey, options.model || 'gpt-4o', {
                temperature: options.temperature,
                max_tokens: options.max_tokens || 1024
            });
        }
        
        // Set system prompt
        llm.systemPrompt = options.systemPrompt;
        
        return llm;
    }

    /**
     * Generate candidate actions based on the current state
     * @param {Object} state - Current workflow state
     * @returns {Promise<Array<string>>} - Candidate actions
     */
    async generateActions(state) {
        const prompt = `
Given the following user workflow state, suggest 3-5 contextually relevant next actions the user might take.
Only provide actions that are directly actionable by the user.

Current workflow state:
${JSON.stringify(state, null, 2)}

Return your response as a JSON array of strings, each representing a possible next action.
Example: ["Join the scheduled meeting", "Open the project document", "Message team member"]
`;

        try {
            const response = await this.actionGenerator.getCompletion(prompt, {
                systemPrompt: this.actionGenerator.systemPrompt,
                useCache: true // Enable caching for action generation
            });
            
            // Parse the response to extract actions
            let actions;
            try {
                actions = JSON.parse(response);
                if (!Array.isArray(actions)) {
                    throw new Error('Response is not an array');
                }
            } catch (parseError) {
                // Fallback: try to extract actions using regex if JSON parsing fails
                const matches = response.match(/\[".*?"\]/g);
                if (matches && matches.length > 0) {
                    actions = JSON.parse(matches[0]);
                } else {
                    // Second fallback: split by newlines and look for action-like lines
                    actions = response.split('\n')
                        .filter(line => line.trim().startsWith('"') || line.trim().startsWith('-'))
                        .map(line => line.replace(/^["-]\s*/, '').replace(/",$/, '').trim())
                        .filter(line => line.length > 0);
                }
            }
            
            // Clean up actions to remove extra quotes
            actions = actions.map(action => {
                // If the action is a string and has quotes at the beginning and end, remove them
                if (typeof action === 'string') {
                    // Remove surrounding quotes if present
                    return action.replace(/^["']+|["']+$/g, '');
                }
                return action;
            });
            
            return actions;
        } catch (error) {
            console.error('Error generating actions:', error);
            return [];
        }
    }
    
    /**
     * Generate candidate actions for multiple states in parallel
     * @param {Array<Object>} states - Array of workflow states
     * @returns {Promise<Array<Array<string>>>} - Array of candidate action arrays
     */
    async batchGenerateActions(states) {
        if (!states || states.length === 0) return [];
        
        console.log(`Batch generating actions for ${states.length} states`);
        
        // Process all states in parallel
        const actionPromises = states.map(state => this.generateActions(state));
        return await Promise.all(actionPromises);
    }

    /**
     * Predict the next state given current state and action
     * @param {Object} state - Current workflow state
     * @param {string} action - Action to take
     * @returns {Promise<Object>} - Predicted next state
     */
    async predictNextState(state, action) {
        const prompt = `
Given the following current workflow state and the action the user is about to take, predict the new workflow state.

Current workflow state:
${JSON.stringify(state, null, 2)}

Action being taken:
${action}

Your response MUST be a valid JSON object representing the new workflow state after the action is taken.
DO NOT include any explanations, markdown formatting, or text before or after the JSON.
Simply return a raw JSON object and nothing else.

Include all relevant state fields and update them appropriately based on the action. DO NOT UPDATE THE ACTION HISTORY.
`;

        try {
            const response = await this.statePredictor.getCompletion(prompt, {
                systemPrompt: this.statePredictor.systemPrompt + "\nYou must ONLY return valid JSON without any additional text, explanations, or formatting.",
                useCache: true, // Enable caching for state prediction
                temperature: 0.1 // Lower temperature for more consistent JSON formatting
            });
            
            // Parse the response to extract the new state
            let new_state;
            try {
                // First try direct parsing
                new_state = JSON.parse(response);
            } catch (parseError) {
                console.log('Initial JSON parsing failed, trying to clean the response');
                
                // Try to clean the response of any non-JSON content
                let cleanedResponse = response;
                
                // Remove markdown code blocks if present
                cleanedResponse = cleanedResponse.replace(/```json\s+/g, '');
                cleanedResponse = cleanedResponse.replace(/```\s*$/g, '');
                
                // Try to find JSON object pattern
                const jsonPattern = /{[\s\S]*}/g;
                const matches = cleanedResponse.match(jsonPattern);
                
                if (matches && matches.length > 0) {
                    try {
                        new_state = JSON.parse(matches[0]);
                        console.log('Successfully extracted JSON from response');
                    } catch (innerError) {
                        console.error('Failed to parse extracted JSON:', innerError);
                        throw innerError; // Re-throw to be caught by outer catch
                    }
                } else {
                    console.error('Could not find valid JSON in response');
                    console.log('Response content:', response);
                    // If all parsing fails, make minimal changes to the state
                    new_state = { ...state };
                    new_state.last_action = action;
                    new_state.action_history = [...(state.action_history || []), action];
                }
            }
            
            return new_state;
        } catch (error) {
            console.error('Error predicting next state:', error);
            // Return a minimal state update on error
            return {
                ...state,
                last_action: action,
                action_history: [...(state.action_history || []), action],
                is_terminal: false
            };
        }
    }
    
    /**
     * Predict next states for multiple state-action pairs in parallel
     * @param {Array<{state: Object, action: string}>} stateActionPairs - Array of state-action pairs
     * @returns {Promise<Array<Object>>} - Array of predicted next states
     */
    async batchPredictNextStates(stateActionPairs) {
        if (!stateActionPairs || stateActionPairs.length === 0) return [];
        
        console.log(`Batch predicting next states for ${stateActionPairs.length} state-action pairs`);
        
        // Process all predictions in parallel
        const predictionPromises = stateActionPairs.map(({ state, action }) => 
            this.predictNextState(state, action)
        );
        
        return await Promise.all(predictionPromises);
    }

    /**
     * Evaluate a state
     * @param {Object} state - State to evaluate
     * @returns {Promise<number>} - Evaluation score (0-1)
     */
    async evaluateState(state) {
        const prompt = `
Given the following workflow state, evaluate it on a scale from 0 to 1, where:
- 0 represents a highly inefficient workflow state with poor task progression and user satisfaction
- 1 represents an optimal workflow state with excellent task progression and user satisfaction. Be critical.

Consider factors such as:
- Task efficiency and progress
- Time management
- User satisfaction
- Alignment with user goals and priorities

Current workflow state:
${JSON.stringify(state, null, 2)}

Return your response as a single decimal number between 0 and 1, representing your evaluation score. Be 
Example: 0.85
`;

        try {
            const response = await this.stateEvaluator.getCompletion(prompt, {
                systemPrompt: this.stateEvaluator.systemPrompt,
                useCache: true // Enable caching for state evaluation
            });
            
            // Parse the response to extract the score
            const scoreMatch = response.match(/(\d+\.\d+|\d+)/);
            if (scoreMatch) {
                const score = parseFloat(scoreMatch[0]);
                return Math.max(0, Math.min(1, score)); // Ensure score is between 0 and 1
            }
            
            // If no score found, return a default value
            return 0.5;
        } catch (error) {
            console.error('Error evaluating state:', error);
            return 0.5; // Default value on error
        }
    }
    
    /**
     * Evaluate multiple states in parallel
     * @param {Array<Object>} states - Array of states to evaluate
     * @returns {Promise<Array<number>>} - Array of evaluation scores
     */
    async batchEvaluateStates(states) {
        if (!states || states.length === 0) return [];
        
        console.log(`Batch evaluating ${states.length} states`);
        
        // Process all states in parallel
        const evaluationPromises = states.map(state => this.evaluateState(state));
        return await Promise.all(evaluationPromises);
    }

    /**
     * Generate reasoning for the selected action
     * @param {Object} initial_state - Initial workflow state
     * @param {Object} best_node - Best node selected
     * @param {number} confidence - Confidence rating
     * @returns {Promise<string>} - Reasoning explanation
     */
    async generateReasoning(initial_state, action, confidence) {
        const prompt = `
Given the following initial workflow state and the recommended action, provide a concise explanation of why this action is optimal.

Initial workflow state:
${JSON.stringify(initial_state, null, 2)}

Recommended action:
${action}

Confidence rating: ${confidence}/10

Provide a brief, clear explanation (2-3 sentences) of why this action is the best choice given the current context.
`;

        try {
            const response = await this.reasoningGenerator.getCompletion(prompt, {
                systemPrompt: this.reasoningGenerator.systemPrompt
            });
            return response.trim();
        } catch (error) {
            console.error('Error generating reasoning:', error);
            return `Based on your current context, ${action} appears to be the most beneficial next step.`;
        }
    }

    /**
     * Clear context for all LLM instances
     */
    clearAllContexts() {
        this.actionGenerator.clearContext();
        this.statePredictor.clearContext();
        this.stateEvaluator.clearContext();
        this.reasoningGenerator.clearContext();
    }
}

module.exports = LLMManager;
