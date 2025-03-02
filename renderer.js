    // Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');
    const GeminiClient = require('./gemini-client');
    const ScreenCapture = require('./screen-capture');
    const config = require('./config');
    
    // Get references to DOM elements
    const container = document.querySelector('.container');
    const closeBtn = document.querySelector('.close-btn');
    const tabSuggestion = document.querySelector('.tab-suggestion');
    const inputContainer = document.querySelector('.input-container');
    const inputField = document.querySelector('.input-container input');
    const sendBtn = document.querySelector('.send-btn');
    const heroText = document.querySelector('.hero-text');
    const greeting = document.querySelector('.greeting');
    const suggestionText = document.querySelector('.suggestion-text');
    const inputHint = document.querySelector('.input-hint');
    const assistantOrb = document.querySelector('.assistant-orb');
    const contextBuilding = document.querySelector('.context-building');
    const contextSourceContainer = document.querySelector('.context-source-container');
    const treeVisualization = document.querySelector('.tree-visualization');
    const geminiStatus = document.querySelector('.gemini-status');
    const geminiResponse = document.querySelector('.gemini-response');
    const geminiResponseContent = document.querySelector('.gemini-response-content');
    const closeResponse = document.querySelector('.close-response');
    
    let isMoving = false;
    let currentRoutine = 'random'; 
    
    // Gemini and screen capture instances
    let geminiClient = null;
    let screenCapture = null;
    let isGeminiConnected = false;
    
    // Initialize Gemini client and screen capture
    const { geminiApiKey, geminiConfig, screenCapture: screenCaptureConfig } = require('./config');
    
    geminiClient = new GeminiClient(geminiApiKey);
    screenCapture = new ScreenCapture(screenCaptureConfig.frameRate);
    
    // Function to connect to Gemini and start screen capture
    async function connectToGemini() {
        if (isGeminiConnected) {
            console.log('Already connected to Gemini');
            return;
        }
        
        geminiStatus.classList.remove('connected', 'error');
        geminiStatus.classList.add('connecting');
        
        try {
            // Connect to Gemini API
            const connected = await geminiClient.connect(geminiConfig);
            
            if (connected) {
                isGeminiConnected = true;
                geminiStatus.classList.remove('connecting', 'error');
                geminiStatus.classList.add('connected');
                console.log('Connected to Gemini');
                
                // Send initial prompt to Gemini
                geminiClient.sendText(
                    "You are my AI assistant that can see my screen. Please observe what I'm doing and provide short summaries of what I'm seeing. " 
                );
                
                // Start screen capture
                const captureStarted = await screenCapture.startCapture((base64Data) => {
                    if (isGeminiConnected) {
                        geminiClient.sendScreenCapture(base64Data);
                    }
                });
                
                if (!captureStarted) {
                    throw new Error('Failed to start screen capture');
                }
                
                // Start sending periodic prompts
                startPeriodicPrompts();
                
                showTemporaryNotification('Connected to Gemini');
            } else {
                throw new Error('Failed to connect to Gemini');
            }
        } catch (error) {
            console.error('Error connecting to Gemini:', error);
            geminiStatus.classList.remove('connected', 'connecting');
            geminiStatus.classList.add('error');
            showTemporaryNotification('Failed to connect to Gemini');
            disconnectFromGemini();
        }
        
        // Set up event listeners
        geminiClient.on('close', () => {
            isGeminiConnected = false;
            geminiStatus.classList.remove('connected', 'connecting');
            geminiStatus.classList.add('error');
            showTemporaryNotification('Disconnected from Gemini');
        });
        
        geminiClient.on('error', (error) => {
            console.error('Gemini error:', error);
            showTemporaryNotification('Error connecting to Gemini');
            geminiStatus.classList.remove('connected', 'connecting');
            geminiStatus.classList.add('error');
        });
        
        geminiClient.on('content', (content) => {
            // Do not log content here since we're already logging in gemini-client.js
            
            // Extract text from parts for display
            if (content && content.parts) {
                const textParts = content.parts
                    .filter(part => part.text)
                    .map(part => part.text);
                
                if (textParts.length > 0) {
                    const responseText = textParts.join('\n');
                    // Don't display in UI as requested
                    // displayGeminiResponse(responseText);
                }
            }
        });
        
        // Add audio event handler
        geminiClient.on('audio', (audioData) => {
            console.log('Received audio from Gemini:', audioData.mimeType);
            
            // Convert base64 to ArrayBuffer
            const binaryString = atob(audioData.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Create an audio context and play the audio
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Decode the audio data
            audioContext.decodeAudioData(bytes.buffer, (buffer) => {
                // Create a source node
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                
                // Connect to the destination (speakers)
                source.connect(audioContext.destination);
                
                // Play the audio
                source.start(0);
                
                console.log('Playing audio response');
            }, (error) => {
                console.error('Error decoding audio data:', error);
            });
        });
        
        // Add suggestion event handler
        geminiClient.on('suggestion', (suggestionData) => {
            console.log('Received suggestion from Gemini:', suggestionData);
            
            try {
                // Update the suggestion text with the received action
                if (suggestionData && suggestionData.action) {
                    // Store the most recent suggestion for later use when exiting thinking mode
                    geminiClient.lastSuggestion = suggestionData;
                    
                    updateSuggestionText(suggestionData.action);
                    
                    // Only update the hero text if not in thinking mode
                    if (!isInThinkingMode) {
                        // Update the hero text with the short hero text if available
                        if (suggestionData.heroText) {
                            changeHeroTextWithFade(suggestionData.heroText);
                        } else if (suggestionData.reasoning) {
                            // Fallback to reasoning for backward compatibility
                            changeHeroTextWithFade(suggestionData.reasoning);
                        }
                    }
                    
                    // No need to store multiple suggestions - just display the most recent one
                }
            } catch (error) {
                console.error('Error processing suggestion:', error);
            }
        });
        
        // Add state_updated event handler to update hero text with real context
        geminiClient.on('state_updated', (stateData) => {
            console.log('Received state update from Gemini');
            
            try {
                // Store the most recent state data
                geminiClient.lastStateData = stateData;
                
                // Extract relevant information from the state to display in hero text
                let contextInfo = '';
                
                if (stateData && stateData.context) {
                    // Try to extract the most relevant piece of information
                    if (stateData.context.currentTask) {
                        contextInfo = `Current task: ${stateData.context.currentTask}`;
                    } else if (stateData.context.activeWindow) {
                        contextInfo = `Working in: ${stateData.context.activeWindow}`;
                    } else if (stateData.context.lastAction) {
                        contextInfo = `Last action: ${stateData.context.lastAction}`;
                    }
                    
                    // Store the formatted context info for later use
                    if (contextInfo) {
                        geminiClient.lastContextInfo = contextInfo;
                    }
                    
                    // Only update hero text if not in thinking mode and we have meaningful content
                    if (contextInfo && !isInThinkingMode) {
                        changeHeroTextWithFade(contextInfo);
                    }
                }
            } catch (error) {
                console.error('Error processing state update:', error);
            }
        });
        
        // Add context_shift event handler to highlight important context changes
        geminiClient.on('context_shift', (contextData) => {
            console.log('Detected context shift:', contextData);
            
            try {
                if (contextData && contextData.observation) {
                    // A context shift is important, so display it prominently
                    const contextMessage = `Context shift: ${contextData.observation.slice(0, 50)}${contextData.observation.length > 50 ? '...' : ''}`;
                    changeHeroTextWithFade(contextMessage);
                }
            } catch (error) {
                console.error('Error processing context shift:', error);
            }
        });
    }
    
    // Function to disconnect from Gemini and stop screen capture
    function disconnectFromGemini() {
        if (!isGeminiConnected) {
            console.log('Not connected to Gemini');
            return;
        }
        
        // Stop screen capture
        screenCapture.stopCapture();
        
        // Stop periodic prompts
        if (periodicPromptInterval) {
            clearInterval(periodicPromptInterval);
            periodicPromptInterval = null;
        }
        
        // Disconnect from Gemini
        geminiClient.disconnect();
        isGeminiConnected = false;
        
        geminiStatus.classList.remove('connected', 'connecting');
        geminiStatus.classList.add('error');
        
        showTemporaryNotification('Disconnected from Gemini');
    }
    
    // Variable to store the periodic prompt interval
    let periodicPromptInterval = null;
    
    // Function to send periodic prompts to Gemini
    function startPeriodicPrompts() {
        if (periodicPromptInterval) {
            clearInterval(periodicPromptInterval);
        }
        
        // Send a structured prompt every 10 seconds
        periodicPromptInterval = setInterval(() => {
            if (isGeminiConnected) {
                const currentTime = new Date().toLocaleString();
                geminiClient.sendText(
                    "Analyze my screen and respond with structured JSON data about what you observe. " +
                    "The current time is " + currentTime + ". " +
                    "BE INCREDIBLY DESCRIPTIVE. Someone who is blind should be able to recreate the exact flow and intent. " +
                    "Note that the Purple rectangle is not a slack notification and is YOU. REMOVE ANY MENTION OF THE NOTIFICATION AND THIS PURPLE RECTANGLE. THE RECTANGLE IS NOT THERE. You are an agent that provides real-time assistance to the user by watching the screen and describing what is occuring." +
                    "Include the following information:\n" +
                    "1. A description of what I'm doing. Think hard and understand the user deeply. Explain the flow, their intent, and be INCREDIBLY DESCRIPTIVE.\n" +
                    "2. Any applications you can identify\n" +
                    "3. Any time references visible\n" +
                    "4. Any documents or files visible (FOCUS ONLY ON THE MAIN SCREENS, DO NOT IMPLY OTHER SCREENS)\n" +
                    "5. Any meetings or calendar events visible\n" +
                    "6. Any specific actions I appear to be taking (like typing, reading, switching apps). Read the screen carefully and imply INCREDIBLY DESCRIPTIVE intent.  Someone who is blind should be able to recreate the exact flow and intent. EACH DESCRIPTION SHOULD BE 3-4 SENTENCES LONG.\n\n" +
                    "Format your response as a JSON object with the following structure:\n" +
                    "{\n" +
                    "  \"description\": \"<Description of what the user is doing. Think hard and understand the user deeply. Explain the flow, their intent, and be INCREDIBLY DESCRIPTIVE. Think hard and understand the user deeply. Explain the flow, their intent, and be descriptive.>\",\n" +
                    "  \"applications\": [\"<app1>\", \"<app2>\"],\n" +
                    "  \"time_references\": [\"<time1>\", \"<time2>\"],\n" +
                    "  \"documents\": [\"<doc1>\", \"<doc2>\"],\n" +
                    "  \"meetings\": [\"<meeting1>\", \"<meeting2>\"],\n" +
                    "  \"actions\": [\"<action1>\", \"<action2>\"]\n" +
                    "}\n\n" +
                    "Provide a complete, valid JSON object even if some fields are empty arrays. " +
                    "Ensure the entire response is a single, well-formed JSON object."
                );
            }
        }, 5000); // 10 seconds
    }
    
    // Function to toggle Gemini connection
    function toggleGeminiConnection() {
        if (isGeminiConnected) {
            disconnectFromGemini();
        } else {
            connectToGemini();
        }
    }
    
    // Add keyboard shortcut to toggle Gemini connection (Ctrl+G)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'g') {
            toggleGeminiConnection();
        }
        
        if (e.key === 'Tab') {
            e.preventDefault();

            // Add completion effect
            const completionEffect = document.createElement('div');
            completionEffect.classList.add('completion-effect');
            tabSuggestion.appendChild(completionEffect);

            tabSuggestion.classList.add('active');


            setTimeout(() => {
                completionEffect.remove();
                tabSuggestion.classList.remove('active');
            }, 1000);
        }

        if (e.key === ' ' && !inputContainer.classList.contains('active')) {
            e.preventDefault(); 

            inputContainer.classList.remove('hidden');
            inputHint.classList.add('hidden');
            inputField.focus();
            inputContainer.classList.add('active');

            container.classList.add('expanded');

            if (window.electron) {
                window.electron.send('resize-window', { expanded: true });
            }
        }

        if (e.key === 'Escape' && inputContainer.classList.contains('active')) {
            inputContainer.classList.add('hidden');
            inputHint.classList.remove('hidden');
            inputContainer.classList.remove('active');

            container.classList.remove('expanded');

            if (window.electron) {
                window.electron.send('resize-window', { expanded: false });
            }
        }

        // For testing - trigger the prediction exploration animation with a key press (T key)
        if (e.key === 't' || e.key === 'T') {
            startPredictionExploration();
        }

        // For testing - end the prediction exploration animation with a key press (R key)
        if (e.key === 'r' || e.key === 'R') {
            endPredictionExploration();
        }

        // Ctrl+M to toggle movement
        if (e.ctrlKey && e.key === 'm') {
            e.preventDefault();
            toggleMovement();
        }
        
        // Ctrl+1 for random movement, Ctrl+2 for demo routine
        if (e.ctrlKey && (e.key === '1' || e.key === '2')) {
            e.preventDefault();
            const routineIndex = parseInt(e.key) - 1;
            
            if (routineIndex >= 0 && routineIndex < routines.length) {
                currentRoutine = routines[routineIndex].name;
                
                // If already moving, restart with new routine
                if (isMoving) {
                    ipcRenderer.send('stop-movement');
                    ipcRenderer.send('start-movement', 3000, currentRoutine);
                }
                
                showTemporaryNotification(`Movement routine: ${routines[routineIndex].label}`);
            }
        }
    });

    // Handle send button click
    sendBtn.addEventListener('click', () => {
        const message = inputField.value.trim();
        if (message) {
            // Process the message (placeholder for actual functionality)
            console.log('Message sent:', message);
            inputField.value = '';
        }
    });

    // Handle Enter key in input field
    inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendBtn.click();
        }
    });

    // Flag to track if we're in thinking mode
    let isInThinkingMode = false;

    // Helper function to change hero text with fade animation
    function changeHeroTextWithFade(newText) {
        heroText.style.opacity = 0;

        setTimeout(() => {
            heroText.textContent = newText;
            heroText.style.opacity = 1;
        }, 500);
    }
    
    // Initial hero text - set to blank until we get real context from Gemini
    changeHeroTextWithFade('');

    // Update greeting based on time of day
    function updateGreeting() {
        const hour = new Date().getHours();

        if (hour < 12) {
            greeting.textContent = 'Good Morning, Armaan';
        } else if (hour < 18) {
            greeting.textContent = 'Good Afternoon, Armaan';
        } else {
            greeting.textContent = 'Good Evening, Armaan';
        }
    }

    // No need to store suggestions since we're only showing the most recent one
    // We'll show 'No action available' until we get a real suggestion
    const NO_ACTION_AVAILABLE = "";

    // No need for an index anymore
    
    // Function to update suggestion text with animation
    function updateSuggestionText(text) {
        // Fade out
        suggestionText.style.opacity = '0';
        
        setTimeout(() => {
            // Update text
            suggestionText.textContent = text;
            
            // Fade in
            suggestionText.style.opacity = '1';
        }, 500);
    }

    // This function is no longer needed as we're only showing the most recent suggestion

    // Initialize with 'No action available'
    updateSuggestionText(NO_ACTION_AVAILABLE);

    // Add a subtle transition to the suggestion text
    suggestionText.style.transition = 'opacity 0.5s ease';

    // Add hover effect to suggestion items
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateX(5px)';
        });

        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateX(0)';
        });
    });

    // Context sources for the animation
    const contextSources = [
        "Reading email inbox",
        "Checking calendar events",
        "Analyzing recent documents",
        "Reviewing task priorities",
    ];

    // Function to show the context building animation
    function showContextBuilding() {
        // Clear any existing context sources
        contextSourceContainer.innerHTML = '';
        
        // Make the context building container visible
        contextBuilding.classList.remove('hidden');
        
        // Pre-calculate positions for all context sources
        const sourceHeight = 60; // Increased height to add more margin between windows
        const totalSources = contextSources.length;
        
        // Pre-create all context sources at once with proper positioning
        contextSources.forEach((source, index) => {
            // Create a new context source element
            const contextSource = document.createElement('div');
            contextSource.className = 'context-source';
            
            // Position from bottom to top (reversed index)
            const position = (totalSources - 1 - index) * sourceHeight;
            contextSource.style.bottom = `${position}px`;
            
            // Add the loading indicator and text
            contextSource.innerHTML = `
                <div class="loading-indicator"></div>
                <div class="context-source-text">${source}</div>
            `;
            
            // Add it to the container
            contextSourceContainer.appendChild(contextSource);
        });
        
        // Add a small delay before adding the visible class for smooth transition
        setTimeout(() => {
            contextBuilding.classList.add('visible');
        }, 50);
        
        // Now animate each context source with a staggered delay
        const contextSourceElements = document.querySelectorAll('.context-source');
        contextSourceElements.forEach((element, index) => {
            // Use an eased timing function for more natural staggering
            // First items appear quickly, later items have more delay between them
            const staggerDelay = 500 + (index * index * 80);
            
            setTimeout(() => {
                element.classList.add('visible');
            }, staggerDelay);
        });
    }

    // Function to hide the context building animation
    function hideContextBuilding() {
        // First remove the visible class to trigger the fade-out animation
        contextBuilding.classList.remove('visible');
        
        // Get all context sources
        const contextSourceElements = document.querySelectorAll('.context-source');
        
        // Remove the 'visible' class from all context sources
        // No need to stagger this since we're handling it in the startPredictionExploration function
        contextSourceElements.forEach(source => {
            source.classList.remove('visible');
        });
        
        // Add the hidden class after the animation completes
        setTimeout(() => {
            if (!contextBuilding.classList.contains('visible')) {
                contextBuilding.classList.add('hidden');
                contextSourceContainer.innerHTML = '';
            }
        }, 500);
    }

    // Function to start the prediction exploration animation
    function startPredictionExploration() {
        isInThinkingMode = true;
        
        // First fade out tab suggestion and input hint
        tabSuggestion.classList.add('fade-out');
        inputHint.classList.add('fade-out');

        // After a short delay, fade out the orb and slide down the hero text
        setTimeout(() => {
            assistantOrb.classList.add('fade-out');

            // Wait a bit more before sliding down the hero text
            setTimeout(() => {
                heroText.classList.add('slide-down');

                // Update hero text to show "thinking" message
                setTimeout(() => {
                    changeHeroTextWithFade("Analyzing possibilities...");
                    
                    // Show the context building animation
                    setTimeout(() => {
                        showContextBuilding();
                        
                        // After the context building animation has run for a while, show the tree visualization
                        setTimeout(() => {
                            // Use a smooth transition to hide the context building animation
                            // First fade out the context sources one by one in reverse order
                            const contextSourceElements = document.querySelectorAll('.context-source');
                            const sourcesArray = Array.from(contextSourceElements);
                            
                            // Fade out each source with a staggered delay (in order of appearance)
                            sourcesArray.forEach((source, index) => {
                                setTimeout(() => {
                                    source.classList.remove('visible');
                                    // Add additional transform for a smoother exit
                                    source.style.transform = 'translateY(10px) scale(0.95)';
                                }, index * 500);
                            });
                            
                            // After all sources have started fading out, hide the container and show the tree
                            setTimeout(() => {
                                hideContextBuilding();
                                
                                // Wait a bit before showing the tree
                                setTimeout(() => {
                                    // Generate the tree structure
                                    generateTreeStructure();
                                    
                                    // After most of the tree is generated, highlight the optimal solution
                                    setTimeout(() => {
                                        highlightOptimalSolution();
                                    }, 3000);
                                }, 300);
                            }, sourcesArray.length * 120 + 200);
                        }, 3000); // Show context building for 3 seconds
                    }, 300);
                }, 300);
            }, 200);
        }, 400);

        // For demo purposes, automatically end the animation after 10 seconds (extended to accommodate the new animation)
        setTimeout(() => {
            endPredictionExploration();
        }, 10000);
    }

    // Function to end the prediction exploration animation and return to original UI
    function endPredictionExploration() {
        // If we're not in thinking mode, no need to do anything
        if (!isInThinkingMode) return;
        
        // Hide the context building animation if it's visible
        hideContextBuilding();
        
        // Hide the tree visualization with opacity transition first
        treeVisualization.style.opacity = '0';
        
        // After the opacity transition, add the hidden class
        setTimeout(() => {
            treeVisualization.classList.add('hidden');
        }, 500);
        
        // After a brief pause, start the return animation
        setTimeout(() => {
            // First bring back the hero text to its original position
            heroText.classList.remove('slide-down');

            // After the hero text starts moving up, fade in the orb
            setTimeout(() => {
                assistantOrb.classList.remove('fade-out');

                // After the orb starts fading in, bring back the tab suggestion and input hint
                setTimeout(() => {
                    tabSuggestion.classList.remove('fade-out');
                    inputHint.classList.remove('fade-out');

                    // Reset hero text to original after all animations complete
                    setTimeout(() => {
                        // First set thinking mode to false to allow new messages to come through
                        isInThinkingMode = false;
                        
                        // Priority order: 1) Latest suggestion, 2) Latest context, 3) Random message
                        if (geminiClient && geminiClient.lastSuggestion && geminiClient.lastSuggestion.heroText) {
                            // Priority 1: Use the latest suggestion hero text
                            changeHeroTextWithFade(geminiClient.lastSuggestion.heroText);
                        } else if (geminiClient && geminiClient.lastContextInfo) {
                            // Priority 2: Use the latest context information
                            changeHeroTextWithFade(geminiClient.lastContextInfo);
                        } else {
                            // Priority 3: Fallback to a random hero message if nothing else is available
                            const randomMessage = heroMessages[Math.floor(Math.random() * heroMessages.length)];
                            changeHeroTextWithFade(randomMessage);
                        }
                        
                        // Request a fresh suggestion to improve responsiveness
                        if (geminiClient && typeof geminiClient.requestSuggestionUpdate === 'function') {
                            geminiClient.requestSuggestionUpdate();
                        }
                    }, 500);
                }, 200);
            }, 300);
        }, 1000);
    }
    

    function highlightOptimalSolution() {
        // Get all active nodes (nodes that are not inactive)
        const activeNodes = Array.from(document.querySelectorAll('.tree-node:not(.inactive)'));
        
        // If there are active nodes, select a random one to be the optimal solution
        if (activeNodes.length > 0) {
            // Prefer nodes from the middle to bottom levels
            const bottomHalfNodes = activeNodes.filter((node) => {
                const y = parseFloat(node.style.top.replace('calc(50% + ', '').replace('px)', ''));
                return y > 0; // Nodes below the center line
            });
            
            const nodesToConsider = bottomHalfNodes.length > 0 ? bottomHalfNodes : activeNodes;
            const randomIndex = Math.floor(Math.random() * nodesToConsider.length);
            const optimalNode = nodesToConsider[randomIndex];
            
            // Add optimal class
            optimalNode.className = 'tree-node optimal';
            
            // Change hero text to indicate solution found
            changeHeroTextWithFade('Optimal solution found!');
        }
    }


    function createTreeNode(x, y, size, delay, isActive) {
        const node = document.createElement('div');
        node.className = isActive ? 'tree-node' : 'tree-node inactive';
        
        // Set position and size
        node.style.position = 'absolute';
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
        node.style.left = `calc(50% + ${x}px)`;
        node.style.top = `calc(50% + ${y}px)`;
        node.style.marginLeft = `-${size/2}px`;
        node.style.marginTop = `-${size/2}px`;
        node.style.transform = 'scale(0)';
        
        // Add to DOM
        treeVisualization.appendChild(node);
        
        // Trigger animation after a delay
        setTimeout(() => {
            node.style.opacity = '1';
            node.style.transform = 'scale(1)';
        }, delay);
        
        return node;
    }
    

    function generateTreeLevel(levelY, count, nodeSize, baseDelay, activeRatio = 0.3) {
        // Calculate spacing and positioning
        const spacing = 30;
        const totalWidth = (count - 1) * spacing;
        const startX = -totalWidth / 2;
        
        // Calculate number of active nodes
        const activeCount = Math.max(1, Math.round(count * activeRatio));
        
        // Generate random active indices
        const activeIndices = new Set();
        while (activeIndices.size < activeCount && activeIndices.size < count) {
            activeIndices.add(Math.floor(Math.random() * count));
        }
        
        // Create nodes
        return Array.from({ length: count }, (_, i) => {
            const x = startX + (i * spacing);
            const delay = baseDelay + (i * 40);
            const isActive = activeIndices.has(i);
            
            return createTreeNode(x, levelY, nodeSize, delay, isActive);
        });
    }
    

    function generateTreeStructure() {
        // Clear existing nodes and show container
        treeVisualization.innerHTML = '';
        treeVisualization.classList.remove('hidden');
        
        // Add a small delay before making it visible with opacity
        setTimeout(() => {
            treeVisualization.style.opacity = '1';
        }, 100);
        
        // Configuration
        const config = {
            nodeSize: 12,
            rootSize: 16,
            levelCount: 11,  
            verticalSpacing: 20,
            startY: -120, 
            baseDelay: 300,
            delayIncrement: 200
        };
        
        // Node count pattern for each level
        const getNodeCount = level => {
            const counts = [1, 3, 5, 7, 9];
            return counts[Math.min(level, counts.length - 1)];
        };
        
        // Generate each level
        for (let i = 0; i < config.levelCount; i++) {
            const y = config.startY + (i * config.verticalSpacing);
            const size = i === 0 ? config.rootSize : config.nodeSize;
            const count = getNodeCount(i);
            const delay = config.baseDelay + (i * config.delayIncrement);
            const activeRatio = i === 0 ? 1 : 0.3;
            
            setTimeout(() => {
                generateTreeLevel(y, count, size, 0, activeRatio);
            }, delay);
        }
    }

    // Function to display Gemini response in the UI
    function displayGeminiResponse(text) {
        geminiResponseContent.textContent = text;
        geminiResponse.classList.remove('hidden');
        geminiResponse.classList.add('visible');
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            hideGeminiResponse();
        }, 10000);
    }
    
    // Function to hide Gemini response
    function hideGeminiResponse() {
        geminiResponse.classList.remove('visible');
        setTimeout(() => {
            geminiResponse.classList.add('hidden');
        }, 300);
    }
    
    // Close response when clicking the close button
    closeResponse.addEventListener('click', () => {
        hideGeminiResponse();
    });

    // Function to toggle movement with the current routine
    function toggleMovement() {
        isMoving = !isMoving;
        
        if (isMoving) {
            // Start movement with the selected routine
            ipcRenderer.send('start-movement', 3000, currentRoutine);
            
            showTemporaryNotification(`Gliding mode activated: ${getRoutineLabel()}`);
        } else {
            ipcRenderer.send('stop-movement');
            
            showTemporaryNotification('Gliding stopped');
        }
    }
    
    // Function to get the current routine's display label
    function getRoutineLabel() {
        if (!currentRoutine) {
            return 'Random';
        }
        
        const routine = routines.find(r => r.name === currentRoutine);
        return routine ? routine.label : 'Random';
    }

    // Add movement control to the orb - double click to toggle movement
    assistantOrb.addEventListener('dblclick', () => {
        toggleMovement();
    });
    
    // Add Gemini control to the orb - shift + double click to toggle Gemini connection
    assistantOrb.addEventListener('dblclick', (e) => {
        if (e.shiftKey) {
            toggleGeminiConnection();
        }
    });
    
    const routines = [
        { name: 'random', label: 'Random Movement' },
        { name: 'demo', label: 'Demo Routine' }
    ];

    updateGreeting();

    closeBtn.addEventListener('click', () => {
        window.close();
    });

    // Initialize Gemini on startup
    connectToGemini();
    
    function showTemporaryNotification(message) {
        const notification = document.createElement('div');
        notification.classList.add('movement-notification');
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 2000);
    }
});
