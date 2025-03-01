/**
 * OpenAI API client for LLM interactions
 * This module handles communication with OpenAI's API for different specialized tasks
 */

const { OpenAI } = require('openai');

class OpenAIClient {
    constructor(apiKey, model = 'gpt-4o', options = {}) {
        this.apiKey = apiKey;
        this.model = model;
        this.options = {
            temperature: 0.7,
            max_tokens: 1024,
            ...options
        };
        this.client = new OpenAI({ apiKey });
        this.contextHistory = [];
    }

    /**
     * Send a message to the OpenAI API
     * @param {string} prompt - The prompt to send
     * @param {Object} options - Additional options for the API call
     * @returns {Promise<string>} - The response from the API
     */
    async getCompletion(prompt, options = {}) {
        try {
            const response = await this.client.chat.completions.create({
                model: options.model || this.model,
                messages: [
                    { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
                    { role: 'user', content: prompt }
                ],
                temperature: options.temperature || this.options.temperature,
                max_tokens: options.max_tokens || this.options.max_tokens
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error getting completion from OpenAI:', error);
            throw error;
        }
    }

    /**
     * Send a message to the OpenAI API with context history
     * @param {string} prompt - The prompt to send
     * @param {Object} options - Additional options for the API call
     * @returns {Promise<string>} - The response from the API
     */
    async getChatCompletion(prompt, options = {}) {
        try {
            // Add new user message to context
            this.contextHistory.push({ role: 'user', content: prompt });

            // Prepare messages including history
            const messages = [
                { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
                ...this.contextHistory
            ];

            // Limit context history if it gets too long
            if (this.contextHistory.length > (options.maxHistoryLength || 10)) {
                // Keep the first system message and the most recent messages
                const historyLimit = (options.maxHistoryLength || 10) - 1;
                this.contextHistory = this.contextHistory.slice(-historyLimit);
            }

            const response = await this.client.chat.completions.create({
                model: options.model || this.model,
                messages,
                temperature: options.temperature || this.options.temperature,
                max_tokens: options.max_tokens || this.options.max_tokens
            });

            const responseContent = response.choices[0].message.content;
            
            // Add assistant response to context
            this.contextHistory.push({ role: 'assistant', content: responseContent });

            return responseContent;
        } catch (error) {
            console.error('Error getting chat completion from OpenAI:', error);
            throw error;
        }
    }

    /**
     * Clear the context history
     */
    clearContext() {
        this.contextHistory = [];
    }

    /**
     * Set the context history
     * @param {Array} history - The context history to set
     */
    setContext(history) {
        this.contextHistory = [...history];
    }
}

module.exports = OpenAIClient;
