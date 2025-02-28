    // Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');
    
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
    const treeVisualization = document.querySelector('.tree-visualization');

    let isMoving = false;
    let currentRoutine = 'random'; 
    
    const routines = [
        { name: 'random', label: 'Random Movement' },
        { name: 'demo', label: 'Demo Routine' }
    ];

    updateGreeting();

    closeBtn.addEventListener('click', () => {
        window.close();
    });


    document.addEventListener('keydown', (e) => {
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

    // Rotate through different context-aware suggestions
    const suggestions = [
        "Join your 4:00 PM meeting with Design Team",
        "Open the project proposal you were working on",
        "Reply to email from Sarah about the deadline",
        "Continue your research on AI assistants"
    ];

    let currentSuggestionIndex = 0;

    function rotateSuggestions() {
        // Fade out
        suggestionText.style.opacity = '0';

        setTimeout(() => {
            // Update text
            currentSuggestionIndex = (currentSuggestionIndex + 1) % suggestions.length;
            suggestionText.textContent = suggestions[currentSuggestionIndex];

            // Fade in
            suggestionText.style.opacity = '1';
        }, 500);
    }

    // Rotate suggestions every 10 seconds
    setInterval(rotateSuggestions, 10000);

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
                    
                    // After the hero text has changed, show the tree visualization
                    setTimeout(() => {
                        // Generate the tree structure
                        generateTreeStructure();
                        
                        // After most of the tree is generated, highlight the optimal solution
                        setTimeout(() => {
                            highlightOptimalSolution();
                        }, 4000);
                    }, 500);
                }, 300);
            }, 200);
        }, 400);

        // For demo purposes, automatically end the animation after 8 seconds
        setTimeout(() => {
            endPredictionExploration();
        }, 8000);
    }

    // Function to end the prediction exploration animation and return to original UI
    function endPredictionExploration() {
        // If we're not in thinking mode, no need to do anything
        if (!isInThinkingMode) return;
        
        // Update hero text first (while it's still in the lower position)

        
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
    
    // Create movement routine menu
    function createMovementMenu() {
        const menu = document.createElement('div');
        menu.classList.add('movement-menu');
        
        // Create title
        const title = document.createElement('div');
        title.classList.add('movement-menu-title');
        title.textContent = 'Movement Routines';
        menu.appendChild(title);
        
        // Create routine options
        routines.forEach((routine, index) => {
            const option = document.createElement('div');
            option.classList.add('movement-menu-option');
            option.innerHTML = `<span class="shortcut">Ctrl+${index + 1}</span> ${routine.label}`;
            
            option.addEventListener('click', () => {
                currentRoutine = routine.name;
                
                // If already moving, restart with new routine
                if (isMoving) {
                    ipcRenderer.send('stop-movement');
                    ipcRenderer.send('start-movement', 3000, currentRoutine);
                }
                
                showTemporaryNotification(`Movement routine: ${routine.label}`);
                menu.classList.remove('show');
            });
            
            menu.appendChild(option);
        });
        
        // Add close button
        const closeButton = document.createElement('div');
        closeButton.classList.add('movement-menu-close');
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => {
            menu.classList.remove('show');
        });
        menu.appendChild(closeButton);
        
        // Add to container
        container.appendChild(menu);
        
        return menu;
    }
    
    // Create the movement menu
    const movementMenu = createMovementMenu();
    
    assistantOrb.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        movementMenu.classList.toggle('show');
    });
    
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
