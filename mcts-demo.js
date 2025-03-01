/**
 * MCTS Demo Script
 * This script demonstrates the Monte Carlo Tree Search (MCTS) implementation
 * with hardcoded user data for a hackathon demo
 */

require('dotenv').config();
const { MCTSPredictor } = require('./mcts');
const LLMManager = require('./llm-manager');
const config = require('./config');

// Mock user data for the demo
const mockUserData = {
    current_time: "2023-03-01T15:00:00",
    active_application: "VS Code",
    upcoming_meetings: [
        {
            title: "Design Team Sync",
            time: "2023-03-01T15:30:00",
            participants: ["Sarah", "Michael", "Emma"],
            location: "Zoom"
        },
        {
            title: "Client Presentation",
            time: "2023-03-01T17:00:00",
            participants: ["Client", "Manager", "You"],
            location: "Conference Room A"
        }
    ],
    open_documents: [
        "project_proposal.docx",
        "design_mockups.fig"
    ],
    recent_communications: [
        {
            person: "Sarah",
            time: "2023-03-01T14:45:00",
            platform: "Slack",
            content: "Can you share the latest design mockups before our meeting?"
        },
        {
            person: "Manager",
            time: "2023-03-01T14:30:00",
            platform: "Email",
            content: "Make sure the client presentation is ready by 5 PM."
        }
    ],
    tasks: [
        {
            title: "Finalize project proposal",
            priority: "High",
            deadline: "2023-03-01T16:00:00",
            status: "In Progress"
        },
        {
            title: "Review design mockups",
            priority: "Medium",
            deadline: "2023-03-01T15:15:00",
            status: "Not Started"
        },
        {
            title: "Prepare client presentation",
            priority: "High",
            deadline: "2023-03-01T16:30:00",
            status: "In Progress"
        }
    ],
    action_history: [
        "Opened VS Code",
        "Edited project proposal document",
        "Checked Slack messages"
    ],
    is_terminal: false
};

// Configuration for the MCTS algorithm
const mctsConfig = {
    max_iterations: 50,         // Number of MCTS iterations to run
    max_simulation_depth: 5,    // Maximum depth for simulations
    exploration_weight: 1.0     // Weight for exploration term in UCB
};

/**
 * Run the MCTS demo
 */
async function runMCTSDemo() {
    console.log("=".repeat(80));
    console.log("MCTS Demo - Intelligent Action Prediction".padStart(50));
    console.log("=".repeat(80));
    
    // Initialize the LLM Manager with Groq support
    if (!config.groqApiKey && !config.openaiApiKey) {
        console.error("Error: At least one API key (GROQ_API_KEY or OPENAI_API_KEY) is required. Please set it in your .env file.");
        process.exit(1);
    }
    
    if (config.groqApiKey) {
        console.log("✅ Using Groq for faster predictions.");
    } else {
        console.log("✅ Using OpenAI for predictions.");
    }
    
    const llmManager = new LLMManager();
    
    // Initialize the MCTS predictor
    const mctsPredictor = new MCTSPredictor(llmManager, mctsConfig);
    
    console.log("\n📊 Current User Context:");
    console.log("-".repeat(80));
    printUserContext(mockUserData);
    
    console.log("\n🔍 Running MCTS to find optimal next action...");
    console.log("-".repeat(80));
    console.time("MCTS Execution Time");
    
    try {
        // Find the best action using MCTS
        const result = await mctsPredictor.find_best_action(mockUserData);
        
        console.timeEnd("MCTS Execution Time");
        console.log("-".repeat(80));
        
        // Display the results
        console.log("\n🎯 Recommended Next Action:");
        console.log("-".repeat(80));
        console.log(`Action: ${result.action}`);
        console.log(`Confidence: ${result.confidence}/10`);
        console.log(`Reasoning: ${result.reasoning}`);
        
        // Display exploration statistics
        console.log("\n📈 Exploration Statistics:");
        console.log("-".repeat(80));
        console.log("Actions explored:");
        
        if (result.exploredPaths && result.exploredPaths.length > 0) {
            // Sort by visits (descending)
            const sortedPaths = [...result.exploredPaths].sort((a, b) => b.visits - a.visits);
            
            // Display as a table
            console.table(sortedPaths.map(path => ({
                Action: typeof path.action === 'string' ? path.action.replace(/^["']+|["']+$/g, '') : path.action,
                Visits: path.visits,
                Value: typeof path.value === 'number' ? path.value.toFixed(3) : path.value
            })));
        } else {
            console.log("No paths explored.");
        }
    } catch (error) {
        console.error("Error running MCTS:", error);
    }
    
    console.log("=".repeat(80));
    console.log("Demo Complete".padStart(40));
    console.log("=".repeat(80));
}

/**
 * Print the user context in a readable format
 * @param {Object} context - User context
 */
function printUserContext(context) {
    // Current time
    console.log(`Time: ${new Date(context.current_time).toLocaleString()}`);
    console.log(`Active Application: ${context.active_application}`);
    
    // Upcoming meetings
    if (context.upcoming_meetings && context.upcoming_meetings.length > 0) {
        console.log("\nUpcoming Meetings:");
        context.upcoming_meetings.forEach(meeting => {
            const meetingTime = new Date(meeting.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            console.log(`- ${meeting.title} at ${meetingTime} (${meeting.location})`);
        });
    }
    
    // Open documents
    if (context.open_documents && context.open_documents.length > 0) {
        console.log("\nOpen Documents:");
        context.open_documents.forEach(doc => {
            console.log(`- ${doc}`);
        });
    }
    
    // Tasks
    if (context.tasks && context.tasks.length > 0) {
        console.log("\nTasks:");
        context.tasks.forEach(task => {
            const deadline = new Date(task.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            console.log(`- [${task.status}] ${task.title} (${task.priority}, due ${deadline})`);
        });
    }
    
    // Recent communications
    if (context.recent_communications && context.recent_communications.length > 0) {
        console.log("\nRecent Communications:");
        context.recent_communications.forEach(comm => {
            const time = new Date(comm.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            console.log(`- ${comm.person} (${time}, via ${comm.platform}): "${comm.content}"`);
        });
    }
    
    // Action history
    if (context.action_history && context.action_history.length > 0) {
        console.log("\nRecent Actions:");
        context.action_history.forEach(action => {
            console.log(`- ${action}`);
        });
    }
}

// Run the demo
runMCTSDemo().catch(console.error);
