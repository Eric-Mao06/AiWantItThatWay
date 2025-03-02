/**
 * Configuration for the application
 */

// Load environment variables from .env file
require('dotenv').config();

module.exports = {
    // Your Gemini API key from environment variable
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    
    // Gemini model configuration
    geminiConfig: {
        model: 'models/gemini-2.0-flash-exp',
        generation_config: {
            response_modalities: ["TEXT"],
            temperature: 0.4,
            top_p: 0.95,
            top_k: 40,
            candidate_count: 1,
            max_output_tokens: 2048
        },
        safety_settings: [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
    },
    
    // Screen capture settings
    screenCapture: {
        frameRate: 2.0, // Frames per second (increased from 0.5)
        quality: 1    // JPEG quality (0-1) (increased from 0.8)
    },
    
    // OpenAI API key from environment variable
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    
    // OpenAI configuration
    openaiConfig: {
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 1024
    },
    
    // Groq API key from environment variable
    groqApiKey: process.env.GROQ_API_KEY || '',
    
    // Groq configuration
    groqConfig: {
        model: 'llama-3.1-8b-instant', // You can also use 'mixtral-8x7b-32768' or other Groq models
        temperature: 0.5,
        max_tokens: 1024
    },
    
    // State history settings
    stateHistory: {
        recentActionsLimit: 1,       // Number of recent actions to keep
        actionHistoryLimit: 10,       // Max number of actions in full history
        actionHistoryToSend: 1,      // Number of action history items to include in model prompts
        eventHistoryLimit: 5          // Number of raw events to keep
    }
};
