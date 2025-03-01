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
            // Extract text from parts for display
            if (content && content.parts) {
                const textParts = content.parts
                    .filter(part => part.text)
                    .map(part => part.text);
                
                if (textParts.length > 0) {
                    const responseText = textParts.join('\n');
                    
                    // Check if this is a short response (likely an intent)
                    if (responseText.length < 100 && !responseText.includes('\n')) {
                        // This is likely an intent detection response
                        updateSuggestionText(responseText);
                    }
                    
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
        
        // First request intent detection immediately
        requestIntentDetection();
        
        // Send a prompt every 3 seconds
        periodicPromptInterval = setInterval(() => {
            if (isGeminiConnected) {
                // Alternate between screen summary and intent detection
                if (Math.random() > 0.5) {
                    geminiClient.sendText(
                        "Based on what you can see on my screen now, please provide a brief summary of what I'm doing. " +
                        "If you can see the content clearly, describe what you observe."
                    );
                } else {
                    requestIntentDetection();
                }
            }
        }, 3000); // 3 seconds
    }

    // Function to request intent detection from Gemini
    function requestIntentDetection() {
        if (isGeminiConnected) {
            geminiClient.sendText(
                "Based on what you can see on my screen, suggest ONE specific action I might want to take next. " +
                "Respond with ONLY the action text in a brief, concise format (10 words or less). " +
                "Make it contextual to what I'm doing. No explanations or prefixes."
            );
        }
    }

    // Function to update the tab suggestion text with a fade animation
    function updateSuggestionText(newText) {
        // Fade out
        suggestionText.style.opacity = '0';

        setTimeout(() => {
            // Update text
            suggestionText.textContent = newText;

            // Fade in
            suggestionText.style.opacity = '1';
        }, 500);
    }

    // Add a subtle transition to the suggestion text
    suggestionText.style.transition = 'opacity 0.5s ease';

    // Function to execute the browser agent with the current suggestion
    function executeBrowserAgent() {
        const currentSuggestion = suggestionText.textContent;
        if (currentSuggestion && currentSuggestion.trim() !== '') {
            console.log(`Executing browser agent with suggestion: ${currentSuggestion}`);
            
            // Show a notification
            showTemporaryNotification(`Executing: ${currentSuggestion}`);
            
            // Send the suggestion to the main process to execute agent.py
            ipcRenderer.send('execute-agent', currentSuggestion);
        } else {
            console.log('No suggestion text available');
            showTemporaryNotification('No suggestion available');
        }
    }

    // Function to toggle Gemini connection
    function toggleGeminiConnection() {
        if (isGeminiConnected) {
            disconnectFromGemini();
        } else {
            connectToGemini();
        }
    }
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Tab key to execute browser agent
        if (e.key === 'Tab') {
            e.preventDefault(); // Prevent default Tab behavior
            
            // Add completion effect
            const completionEffect = document.createElement('div');
            completionEffect.classList.add('completion-effect');
            tabSuggestion.appendChild(completionEffect);

            tabSuggestion.classList.add('active');

            // Execute the browser agent
            executeBrowserAgent();

            setTimeout(() => {
                completionEffect.remove();
                tabSuggestion.classList.remove('active');
            }, 1000);
        }
        
        // Ctrl+G to toggle Gemini connection
        if (e.ctrlKey && e.key === 'g') {
            toggleGeminiConnection();
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
            // Start the animation directly
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

    // Rotate hero text messages
    const heroMessages = [
        "You have a meeting in 5 minutes!",
        "Your project proposal is due today",
        "Would you like to schedule focus time?",
        "3 emails need your attention",
        "Remember to take a break soon"
    ];

    let currentHeroIndex = 0;

    // Flag to track if we're in thinking mode
    let isInThinkingMode = false;

    // Helper function to change hero text with fade animation
    function changeHeroTextWithFade(newText) {
        // If we're in thinking mode and this is a random hero message, don't change the text
        // We can identify random hero messages by checking if the text is in the heroMessages array
        if (isInThinkingMode && heroMessages.includes(newText)) {
            return;
        }
        
        heroText.style.opacity = 0;

        setTimeout(() => {
            heroText.textContent = newText;
            heroText.style.opacity = 1;
        }, 500);
    }

    function rotateHeroMessages() {
        if (!isInThinkingMode) {
            currentHeroIndex = (currentHeroIndex + 1) % heroMessages.length;
            changeHeroTextWithFade(heroMessages[currentHeroIndex]);
        }
    }

    // Rotate suggestions every 8 seconds
    setInterval(rotateHeroMessages, 8000);

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
        const topMargin = 100; // Add a top margin to start below the top edge
        
        // Pre-create all context sources at once with proper positioning
        contextSources.forEach((source, index) => {
            // Create a new context source element
            const contextSource = document.createElement('div');
            contextSource.className = 'context-source';
            
            // Position from top to bottom
            const position = topMargin + (index * sourceHeight);
            contextSource.style.top = `${position}px`;
            contextSource.style.bottom = 'auto'; // Remove bottom positioning
            
            // Add the loading indicator and text
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            
            const textElement = document.createElement('div');
            textElement.className = 'context-source-text';
            textElement.textContent = source;
            
            contextSource.appendChild(loadingIndicator);
            contextSource.appendChild(textElement);
            
            // Add to container
            contextSourceContainer.appendChild(contextSource);
            
            // Stagger the appearance of each source
            setTimeout(() => {
                contextSource.classList.add('visible');
            }, index * 500);
        });
        
        // Make the entire context building visible
        setTimeout(() => {
            contextBuilding.classList.add('visible');
        }, 100);
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
        
        // Fade out UI elements
        tabSuggestion.classList.add('fade-out');
        inputHint.classList.add('fade-out');
        assistantOrb.classList.add('fade-out');
        
        // Slide down the hero text and make it nearly invisible
        heroText.classList.add('slide-down');
        
        // Show the context building animation first
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

        // For demo purposes, automatically end the animation after 10 seconds
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
        
        // Hide the tree visualization
        treeVisualization.classList.add('hidden');
        
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
                        // Get a random hero message
                        const randomMessage = heroMessages[Math.floor(Math.random() * heroMessages.length)];
                        changeHeroTextWithFade(randomMessage);
                        isInThinkingMode = false;
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
    
    // Add click event listener to the tab-suggestion element
    document.querySelector('.tab-suggestion').addEventListener('click', () => {
        executeBrowserAgent();
    });

    // Handle agent output and errors
    ipcRenderer.on('agent-output', (event, output) => {
        console.log('Agent output:', output);
        // Optionally display the output in the UI
    });

    ipcRenderer.on('agent-error', (event, error) => {
        console.error('Agent error:', error);
        showTemporaryNotification('Error executing browser agent');
    });

    ipcRenderer.on('agent-completed', (event, code) => {
        console.log(`Agent completed with code: ${code}`);
        if (code === 0) {
            showTemporaryNotification('Browser agent completed successfully');
        } else {
            showTemporaryNotification(`Browser agent failed with code: ${code}`);
        }
    });
});
