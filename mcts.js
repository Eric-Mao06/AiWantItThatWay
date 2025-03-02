/**
 * Monte Carlo Tree Search (MCTS) implementation for next action prediction
 * This module implements MCTS combined with LLM for intelligent action suggestions
 */

class MCTSNode {
    constructor(state, parent = null, action = null) {
        this.state = state;           // Current workflow state
        this.parent = parent;         // Parent node
        this.action = action;         // Action that led to this state
        this.children = [];           // Child nodes
        this.visits = 0;              // Number of times this node has been visited
        this.value = 0;               // Total value accumulated at this node
        this.untried_actions = null;  // Actions not yet tried from this state
    }

    /**
     * Get the average value of this node
     * @returns {number} - Average value
     */
    get average_value() {
        return this.visits === 0 ? 0 : this.value / this.visits;
    }

    /**
     * Get the UCB1 score for this node
     * @param {number} exploration_weight - Weight for exploration term
     * @returns {number} - UCB1 score
     */
    ucb_score(exploration_weight = 1.0) {
        if (this.visits === 0) {
            return Infinity; // Ensure unvisited nodes are explored
        }
        
        const exploitation = this.average_value;
        const exploration = exploration_weight * Math.sqrt(Math.log(this.parent.visits) / this.visits);
        
        return exploitation + exploration;
    }

    /**
     * Check if this node is fully expanded
     * @returns {boolean} - True if all actions have been tried
     */
    is_fully_expanded() {
        return this.untried_actions !== null && this.untried_actions.length === 0;
    }

    /**
     * Check if this node is a terminal node
     * @returns {boolean} - True if this is a terminal node
     */
    is_terminal() {
        return this.state.is_terminal;
    }

    /**
     * Add a child node
     * @param {Object} state - New state
     * @param {string} action - Action that led to the new state
     * @returns {MCTSNode} - New child node
     */
    add_child(state, action) {
        const child = new MCTSNode(state, this, action);
        this.children.push(child);
        
        // Remove this action from untried actions
        if (this.untried_actions !== null) {
            this.untried_actions = this.untried_actions.filter(a => a !== action);
        }
        
        return child;
    }

    /**
     * Update the node with a new value
     * @param {number} value - Value to add
     */
    update(value) {
        this.visits += 1;
        this.value += value;
    }
}

class MCTSPredictor {
    /**
     * Create a new MCTS Predictor
     * @param {Object} options - Options for the predictor
     * @param {Object} options.llmManager - LLM Manager instance
     * @param {Object} options.config - Configuration options
     */
    constructor({ llmManager, config = {} }) {
        if (!llmManager) {
            throw new Error('LLM Manager is required for MCTSPredictor');
        }
        
        this.llmManager = llmManager;
        this.config = {
            max_iterations: 100,
            max_simulation_depth: 3,
            exploration_weight: 1.0,
            ...(config || {})
        };
    }

    /**
     * Run MCTS to find the best next action
     * @param {Object} initial_state - Initial workflow state
     * @returns {Object} - Best action and its expected value
     */
    async find_best_action(initial_state) {
        // Add terminal flag if not present
        if (initial_state.is_terminal === undefined) {
            initial_state.is_terminal = false;
        }
        
        // Add action history if not present
        if (!initial_state.action_history) {
            initial_state.action_history = [];
        }
        
        this.initialDepth = initial_state.action_history.length;
        console.log(`Starting MCTS with initial state:`, initial_state);
        
        const root = new MCTSNode(initial_state);
        root.untried_actions = await this._get_candidate_actions(initial_state);
        console.log(`Generated ${root.untried_actions.length} candidate actions:`, root.untried_actions);

        // Batch size for parallel processing
        const batchSize = 5; // Process 5 iterations in parallel
        const totalIterations = this.config.max_iterations;
        
        // Run MCTS in batches for better parallelization
        for (let batchStart = 0; batchStart < totalIterations; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, totalIterations);
            const batchPromises = [];
            
            console.log(`Processing batch ${batchStart/batchSize + 1}: iterations ${batchStart+1}-${batchEnd}`);
            
            // Create a batch of iteration promises
            for (let i = batchStart; i < batchEnd; i++) {
                batchPromises.push((async () => {
                    // Selection phase
                    let node = this._select(root);
                    
                    // Expansion phase
                    if (!node.is_terminal() && !node.is_fully_expanded()) {
                        node = await this._expand(node);
                        console.log(`Iteration ${i+1}: Expanded with action: "${node.action}" at depth ${this._get_depth(node.state)}`);
                    }
                    
                    // Simulation phase
                    const value = await this._simulate(node);
                    
                    // Backpropagation phase
                    this._backpropagate(node, value);
                    
                    return { iteration: i+1, value };
                })());
            }
            
            // Wait for all iterations in the batch to complete
            const results = await Promise.all(batchPromises);
            
            // Log batch completion
            console.log(`Completed batch ${batchStart/batchSize + 1} (iterations ${batchStart+1}-${batchEnd})`);
        }

        // Find the best child of the root node
        const best_child = this._best_child(root, 0); // No exploration for final selection
        
        if (!best_child) {
            console.error('No best child found');
            return {
                action: "No action available",
                state: initial_state,
                value: 0,
                confidence: 0,
                reasoning: "No actions could be determined based on the current context."
            };
        }
        
        const confidence = this._calculate_confidence(best_child, root.children);
        console.log(`Selected best action: "${best_child.action}" with value ${best_child.average_value.toFixed(3)} and confidence ${confidence.toFixed(2)}`);
        
        const reasoning = await this.llmManager.generateReasoning(
            initial_state, 
            best_child.action,
            confidence
        );
        
        // Generate hero text (shorter version for UI)
        const heroText = await this.llmManager.generateHeroText(
            initial_state, 
            best_child.action,
            confidence
        );
        
        // Consolidate actions with the same name for the exploredPaths output
        const actionMap = new Map();
        
        root.children.forEach(child => {
            const cleanAction = typeof child.action === 'string' ? 
                child.action.replace(/^["']+|["']+$/g, '') : child.action;
                
            if (actionMap.has(cleanAction)) {
                // If this action already exists, update its visits and value
                const existing = actionMap.get(cleanAction);
                existing.visits += child.visits;
                // Average the values weighted by visits
                existing.value = ((existing.value * existing.originalVisits) + 
                                 (child.average_value * child.visits)) / 
                                 (existing.originalVisits + child.visits);
                existing.originalVisits += child.visits;
            } else {
                // Otherwise add it to the map
                actionMap.set(cleanAction, {
                    action: cleanAction,
                    visits: child.visits,
                    value: child.average_value,
                    originalVisits: child.visits
                });
            }
        });
        
        // Convert the map values to an array and format values as strings
        const consolidatedPaths = Array.from(actionMap.values()).map(item => ({
            action: item.action,
            visits: item.visits,
            value: item.value.toFixed(3)
        }));
        
        return {
            action: best_child.action.replace(/^["']+|["']+$/g, ''), // Clean up quotes in the best action
            state: best_child.state,
            value: best_child.average_value,
            confidence,
            reasoning,
            heroText,
            exploredPaths: consolidatedPaths
        };
    }

    /**
     * Selection phase: select a node to expand
     * @param {MCTSNode} node - Starting node
     * @returns {MCTSNode} - Selected node
     */
    _select(node) {
        while (!node.is_terminal() && node.is_fully_expanded()) {
            node = this._best_child(node, this.config.exploration_weight);
        }
        return node;
    }

    /**
     * Expansion phase: expand a node by trying an untried action
     * @param {MCTSNode} node - Node to expand
     * @returns {MCTSNode} - New child node
     */
    async _expand(node) {
        // If untried_actions is null, initialize it
        if (node.untried_actions === null) {
            node.untried_actions = await this._get_candidate_actions(node.state);
        }
        
        // If no untried actions, return the node
        if (node.untried_actions.length === 0) {
            return node;
        }
        
        // Choose a random untried action
        let action = node.untried_actions[Math.floor(Math.random() * node.untried_actions.length)];
        
        // Clean up action string to remove extra quotes
        if (typeof action === 'string') {
            action = action.replace(/^["']+|["']+$/g, '');
        }
        
        // Log current state depth before prediction
        const currentDepth = this._get_depth(node.state);
        console.log(`Before prediction - Current depth: ${currentDepth}, Action history length: ${node.state.action_history?.length || 0}`);
        
        // Use LLM to predict the next state
        const next_state = await this._predict_next_state(node.state, action);
        
        // Log next state depth after prediction
        const nextDepth = this._get_depth(next_state);
        console.log(`After prediction - Next depth: ${nextDepth}, Action history length: ${next_state.action_history?.length || 0}`);
        
        // Check if we've reached max depth
        if (this._get_relative_depth(next_state) >= this.config.max_simulation_depth) {
            next_state.is_terminal = true;
            console.log(`Reached max depth ${this.config.max_simulation_depth} with action: "${action}"`);
        }
        
        // Add child node
        return node.add_child(next_state, action);
    }
    
    /**
     * Batch expansion of multiple nodes
     * @param {Array<MCTSNode>} nodes - Nodes to expand
     * @returns {Promise<Array<MCTSNode>>} - Expanded child nodes
     */
    async _expandBatch(nodes) {
        if (!nodes || nodes.length === 0) return [];
        
        // First, ensure all nodes have their untried_actions initialized
        const nodesToInitialize = nodes.filter(node => node.untried_actions === null);
        
        if (nodesToInitialize.length > 0) {
            // Get all the states that need actions
            const states = nodesToInitialize.map(node => node.state);
            
            // Batch generate actions for all states
            const actionsBatch = await this.llmManager.batchGenerateActions(states);
            
            // Assign the generated actions to each node
            nodesToInitialize.forEach((node, index) => {
                node.untried_actions = actionsBatch[index];
            });
        }
        
        // Filter out nodes with no untried actions
        const expandableNodes = nodes.filter(node => 
            node.untried_actions && node.untried_actions.length > 0);
        
        if (expandableNodes.length === 0) return nodes;
        
        // For each node, choose a random untried action
        const stateActionPairs = expandableNodes.map(node => {
            const action = node.untried_actions[Math.floor(Math.random() * node.untried_actions.length)];
            return { node, state: node.state, action };
        });
        
        // Batch predict next states
        const nextStates = await this.llmManager.batchPredictNextStates(
            stateActionPairs.map(({ state, action }) => ({ state, action }))
        );
        
        // Create child nodes
        const childNodes = [];
        
        stateActionPairs.forEach(({ node, action }, index) => {
            const next_state = nextStates[index];
            
            // Check if we've reached max depth
            if (this._get_relative_depth(next_state) >= this.config.max_simulation_depth) {
                next_state.is_terminal = true;
                console.log(`Reached max depth ${this.config.max_simulation_depth} with action: "${action}"`);
            }
            
            // Add child node
            const childNode = node.add_child(next_state, action);
            childNodes.push(childNode);
        });
        
        return childNodes;
    }

    /**
     * Simulation phase: simulate from a node to estimate value
     * @param {MCTSNode} node - Starting node
     * @returns {number} - Estimated value
     */
    async _simulate(node) {
        let current_state = { ...node.state };
        let depth = this._get_depth(current_state);
        
        console.log(`Simulating from node with action: "${node.action || 'root'}" at depth ${depth}`);
        
        // If already at max depth or terminal, evaluate directly
        if (current_state.is_terminal || depth >= this.config.max_simulation_depth) {
            const value = await this._evaluate_state(current_state);
            console.log(`Direct evaluation at depth ${depth}: ${value.toFixed(3)}`);
            return value;
        }
        
        // Simulate until terminal state or max depth
        const maxSteps = this.config.max_simulation_depth - depth;
        const simulationSteps = [];
        
        // Pre-plan simulation steps (up to max depth) to enable parallel processing
        for (let step = 0; step < maxSteps; step++) {
            simulationSteps.push({
                state: step === 0 ? current_state : null,
                action: null,
                depth: depth + step
            });
        }
        
        // Execute simulation steps with parallel API calls where possible
        for (let i = 0; i < simulationSteps.length; i++) {
            const step = simulationSteps[i];
            
            if (i > 0) {
                step.state = simulationSteps[i-1].nextState;
            }
            
            if (!step.state || step.state.is_terminal) {
                simulationSteps.length = i; // Truncate remaining steps
                break;
            }
            
            // Get possible actions
            const actions = await this._get_candidate_actions(step.state);
            
            if (actions.length === 0) {
                console.log(`No actions available at depth ${step.depth}`);
                simulationSteps.length = i + 1; // Include current step but truncate remaining
                break;
            }
            
            // Choose random action
            step.action = actions[Math.floor(Math.random() * actions.length)];
            console.log(`Simulation step: Trying action: "${step.action}" at depth ${step.depth}`);
            
            // Predict next state
            step.nextState = await this._predict_next_state(step.state, step.action);
            
            // Set terminal if max depth reached
            if (step.depth + 1 >= this.config.max_simulation_depth) {
                step.nextState.is_terminal = true;
            }
        }
        
        // Get the final state from the last simulation step
        const finalState = simulationSteps.length > 0 
            ? simulationSteps[simulationSteps.length - 1].nextState || simulationSteps[simulationSteps.length - 1].state
            : current_state;
        
        // Evaluate final state
        const finalValue = await this._evaluate_state(finalState);
        console.log(`Final simulation value: ${finalValue.toFixed(3)} at depth ${this._get_depth(finalState)}`);
        return finalValue;
    }

    /**
     * Backpropagation phase: update values up the tree
     * @param {MCTSNode} node - Starting node
     * @param {number} value - Value to propagate
     */
    _backpropagate(node, value) {
        let nodeCount = 0;
        while (node !== null) {
            node.update(value);
            node = node.parent;
            nodeCount++;
        }
        console.log(`Backpropagated value ${value.toFixed(3)} through ${nodeCount} nodes`);
    }

    /**
     * Select the best child of a node
     * @param {MCTSNode} node - Parent node
     * @param {number} exploration_weight - Weight for exploration term
     * @returns {MCTSNode} - Best child
     */
    _best_child(node, exploration_weight) {
        if (!node.children || node.children.length === 0) {
            return null;
        }
        
        return node.children.reduce((best, child) => {
            const score = child.ucb_score(exploration_weight);
            return score > best.score ? { node: child, score } : best;
        }, { node: null, score: -Infinity }).node;
    }

    /**
     * Calculate confidence rating for a selected action
     * @param {MCTSNode} best_child - Best child node
     * @param {Array<MCTSNode>} all_children - All children nodes
     * @returns {number} - Confidence rating (0-10)
     */
    _calculate_confidence(best_child, all_children) {
        if (!best_child || all_children.length === 0) {
            return 0;
        }
        
        // Calculate relative advantage over average of other options
        const others = all_children.filter(child => child !== best_child);
        const others_avg = others.length > 0 
            ? others.reduce((sum, child) => sum + child.average_value, 0) / others.length 
            : 0;
        
        // Calculate advantage ratio
        const advantage = best_child.average_value - others_avg;
        
        // Convert to 0-10 scale with sigmoid-like scaling
        const confidence = 10 / (1 + Math.exp(-advantage * 2));
        
        // Round to 1 decimal place
        return Math.round(confidence * 10) / 10;
    }

    /**
     * Get candidate actions from the current state using LLM
     * @param {Object} state - Current workflow state
     * @returns {Array<string>} - Candidate actions
     */
    async _get_candidate_actions(state) {
        return await this.llmManager.generateActions(state);
    }
    
    /**
     * Get candidate actions for multiple states in parallel
     * @param {Array<Object>} states - Array of states
     * @returns {Promise<Array<Array<string>>>} - Array of candidate action arrays
     */
    async _get_batch_candidate_actions(states) {
        return await this.llmManager.batchGenerateActions(states);
    }

    /**
     * Predict the next state given current state and action using LLM
     * @param {Object} state - Current workflow state
     * @param {string} action - Action to take
     * @returns {Object} - Predicted next state
     */
    async _predict_next_state(state, action) {
        console.log(`Predicting next state for action: "${action}"`);
        console.log(`Current state action history: [${state.action_history?.join(', ')}]`);
        
        const new_state = await this.llmManager.predictNextState(state, action);

        // Log the action history type and length for debugging
        if (new_state.action_history) {
            console.log(`LLM returned state with action history, type: ${Array.isArray(new_state.action_history) ? 'Array' : typeof new_state.action_history}, length: ${Array.isArray(new_state.action_history) ? new_state.action_history.length : 'N/A'}`);
            
            // Ensure action_history only contains strings
            if (Array.isArray(new_state.action_history)) {
                new_state.action_history = new_state.action_history
                    .map(item => typeof item === 'string' ? item : JSON.stringify(item))
                    .filter(item => typeof item === 'string' && !item.includes('examining') && !item.includes('console'));
            } else {
                // If action_history is not an array, reset it
                new_state.action_history = [];
            }
        } else {
            console.log(`LLM returned state without action history`);
        }
        
        // Ensure action history is updated
        if (!new_state.action_history) {
            new_state.action_history = [...(state.action_history || []), action];
            console.log(`Created new action history with length: ${new_state.action_history.length}`);
        } else if (!new_state.action_history.includes(action)) {
            new_state.action_history.push(action);
            console.log(`Added action to existing history, new length: ${new_state.action_history.length}`);
        } else {
            console.log(`Action already in history, no change needed`);
        }
        
        // Ensure last_action is set
        new_state.last_action = action;
        
        return new_state;
    }
    
    /**
     * Predict next states for multiple state-action pairs in parallel
     * @param {Array<{state: Object, action: string}>} stateActionPairs - Array of state-action pairs
     * @returns {Promise<Array<Object>>} - Array of predicted next states
     */
    async _predict_batch_next_states(stateActionPairs) {
        const results = await this.llmManager.batchPredictNextStates(stateActionPairs);
        
        // Process each result to ensure action history and last_action are properly set
        return results.map((new_state, index) => {
            const { state, action } = stateActionPairs[index];
            
            // Ensure action history is updated
            if (!new_state.action_history) {
                new_state.action_history = [...(state.action_history || []), action];
            } else if (!new_state.action_history.includes(action)) {
                new_state.action_history.push(action);
            }
            
            // Ensure last_action is set
            new_state.last_action = action;
            
            return new_state;
        });
    }

    /**
     * Evaluate a state using LLM
     * @param {Object} state - State to evaluate
     * @returns {number} - Evaluation score (0-1)
     */
    async _evaluate_state(state) {
        return await this.llmManager.evaluateState(state);
    }
    
    /**
     * Evaluate multiple states in parallel
     * @param {Array<Object>} states - Array of states to evaluate
     * @returns {Promise<Array<number>>} - Array of evaluation scores
     */
    async _evaluate_batch_states(states) {
        return await this.llmManager.batchEvaluateStates(states);
    }

    /**
     * Get the depth of a state in the simulation
     * @param {Object} state - State to check
     * @returns {number} - Depth of the state
     */
    _get_depth(state) {
        return (state.action_history || []).length;
    }

    _get_relative_depth(state) {
        const initial_depth = this.initialDepth || 0;
        return (state.action_history || []).length - initial_depth;
    }
}

module.exports = { MCTSNode, MCTSPredictor };
