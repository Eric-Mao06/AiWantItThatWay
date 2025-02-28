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
        frameRate: 1.0, // Frames per second (increased from 0.5)
        quality: 0.9    // JPEG quality (0-1) (increased from 0.8)
    }
};
