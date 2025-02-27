    document.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');
    
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

        if (e.key === 't' || e.key === 'T') {
            startPredictionExploration();
        }

        if (e.key === 'r' || e.key === 'R') {
            endPredictionExploration();
        }

        if (e.ctrlKey && e.key === 'm') {
            e.preventDefault();
            toggleMovement();
        }
        
        if (e.ctrlKey && (e.key === '1' || e.key === '2')) {
            e.preventDefault();
            const routineIndex = parseInt(e.key) - 1;
            
            if (routineIndex >= 0 && routineIndex < routines.length) {
                currentRoutine = routines[routineIndex].name;
                
                if (isMoving) {
                    ipcRenderer.send('stop-movement');
                    ipcRenderer.send('start-movement', 3000, currentRoutine);
                }
                
                showTemporaryNotification(`Movement routine: ${routines[routineIndex].label}`);
            }
        }
    });

    sendBtn.addEventListener('click', () => {
        const message = inputField.value.trim();
        if (message) {
            console.log('Message sent:', message);
            inputField.value = '';
        }
    });

    inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendBtn.click();
        }
    });

    const heroMessages = [
        "You have a meeting in 5 minutes!",
        "Your project proposal is due today",
        "Would you like to schedule focus time?",
        "3 emails need your attention",
        "Remember to take a break soon"
    ];

    let currentHeroIndex = 0;

    let isInThinkingMode = false;

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

    setInterval(rotateHeroMessages, 8000);

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

    const suggestions = [
        "Join your 4:00 PM meeting with Design Team",
        "Open the project proposal you were working on",
        "Reply to email from Sarah about the deadline",
        "Continue your research on AI assistants"
    ];

    let currentSuggestionIndex = 0;

    function rotateSuggestions() {
        suggestionText.style.opacity = '0';

        setTimeout(() => {
            currentSuggestionIndex = (currentSuggestionIndex + 1) % suggestions.length;
            suggestionText.textContent = suggestions[currentSuggestionIndex];

            suggestionText.style.opacity = '1';
        }, 500);
    }

    setInterval(rotateSuggestions, 10000);

    suggestionText.style.transition = 'opacity 0.5s ease';

    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateX(5px)';
        });

        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateX(0)';
        });
    });

    function startPredictionExploration() {
        isInThinkingMode = true;
        
        tabSuggestion.classList.add('fade-out');
        inputHint.classList.add('fade-out');

        setTimeout(() => {
            assistantOrb.classList.add('fade-out');

            setTimeout(() => {
                heroText.classList.add('slide-down');

                setTimeout(() => {
                    changeHeroTextWithFade("Analyzing possibilities...");
                    
                    setTimeout(() => {
                        generateTreeStructure();
                        
                        setTimeout(() => {
                            highlightOptimalSolution();
                        }, 4000);
                    }, 500);
                }, 300);
            }, 200);
        }, 400);

        setTimeout(() => {
            endPredictionExploration();
        }, 8000);
    }

    function endPredictionExploration() {
        if (!isInThinkingMode) return;
        
        changeHeroTextWithFade("Found the optimal solution!");
        
        treeVisualization.classList.add('hidden');
        
        setTimeout(() => {
            heroText.classList.remove('slide-down');

            setTimeout(() => {
                assistantOrb.classList.remove('fade-out');

                setTimeout(() => {
                    tabSuggestion.classList.remove('fade-out');
                    inputHint.classList.remove('fade-out');

                    setTimeout(() => {
                        const randomMessage = heroMessages[Math.floor(Math.random() * heroMessages.length)];
                        changeHeroTextWithFade(randomMessage);
                        isInThinkingMode = false;
                    }, 500);
                }, 200);
            }, 300);
        }, 1000);
    }

    function highlightOptimalSolution() {
        const activeNodes = Array.from(document.querySelectorAll('.tree-node:not(.inactive)'));
        
        if (activeNodes.length > 0) {
            const bottomHalfNodes = activeNodes.filter((node) => {
                const y = parseFloat(node.style.top.replace('calc(50% + ', '').replace('px)', ''));
                return y > 0; 
            });
            
            const nodesToConsider = bottomHalfNodes.length > 0 ? bottomHalfNodes : activeNodes;
            const randomIndex = Math.floor(Math.random() * nodesToConsider.length);
            const optimalNode = nodesToConsider[randomIndex];
            
            optimalNode.className = 'tree-node optimal';
            
            changeHeroTextWithFade('Optimal solution found!');
        }
    }

    function createTreeNode(x, y, size, delay, isActive) {
        const node = document.createElement('div');
        node.className = isActive ? 'tree-node' : 'tree-node inactive';
        
        node.style.position = 'absolute';
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
        node.style.left = `calc(50% + ${x}px)`;
        node.style.top = `calc(50% + ${y}px)`;
        node.style.marginLeft = `-${size/2}px`;
        node.style.marginTop = `-${size/2}px`;
        node.style.transform = 'scale(0)';
        
        treeVisualization.appendChild(node);
        
        setTimeout(() => {
            node.style.opacity = '1';
            node.style.transform = 'scale(1)';
        }, delay);
        
        return node;
    }
    
    function generateTreeLevel(levelY, count, nodeSize, baseDelay, activeRatio = 0.3) {
        const spacing = 30;
        const totalWidth = (count - 1) * spacing;
        const startX = -totalWidth / 2;
        
        const activeCount = Math.max(1, Math.round(count * activeRatio));
        
        const activeIndices = new Set();
        while (activeIndices.size < activeCount && activeIndices.size < count) {
            activeIndices.add(Math.floor(Math.random() * count));
        }
        
        return Array.from({ length: count }, (_, i) => {
            const x = startX + (i * spacing);
            const delay = baseDelay + (i * 40);
            const isActive = activeIndices.has(i);
            
            return createTreeNode(x, levelY, nodeSize, delay, isActive);
        });
    }
    
    function generateTreeStructure() {
        treeVisualization.innerHTML = '';
        treeVisualization.classList.remove('hidden');
        
        const config = {
            nodeSize: 12,
            rootSize: 16,
            levelCount: 11,
            verticalSpacing: 20,
            startY: -120,
            baseDelay: 300,
            delayIncrement: 200
        };
        
        const getNodeCount = level => {
            const counts = [1, 3, 5, 7, 9];
            return counts[Math.min(level, counts.length - 1)];
        };
        
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

    function toggleMovement() {
        isMoving = !isMoving;
        
        if (isMoving) {
            ipcRenderer.send('start-movement', 3000, currentRoutine);
            
            showTemporaryNotification(`Gliding mode activated: ${getRoutineLabel()}`);
        } else {
            ipcRenderer.send('stop-movement');
            
            showTemporaryNotification('Gliding stopped');
        }
    }
    
    function getRoutineLabel() {
        if (!currentRoutine) {
            return 'Random';
        }
        
        const routine = routines.find(r => r.name === currentRoutine);
        return routine ? routine.label : 'Random';
    }

    assistantOrb.addEventListener('dblclick', () => {
        toggleMovement();
    });
    
    function createMovementMenu() {
        const menu = document.createElement('div');
        menu.classList.add('movement-menu');
        
        const title = document.createElement('div');
        title.classList.add('movement-menu-title');
        title.textContent = 'Movement Routines';
        menu.appendChild(title);
        
        routines.forEach((routine, index) => {
            const option = document.createElement('div');
            option.classList.add('movement-menu-option');
            option.innerHTML = `<span class="shortcut">Ctrl+${index + 1}</span> ${routine.label}`;
            
            option.addEventListener('click', () => {
                currentRoutine = routine.name;
                
                if (isMoving) {
                    ipcRenderer.send('stop-movement');
                    ipcRenderer.send('start-movement', 3000, currentRoutine);
                }
                
                showTemporaryNotification(`Movement routine: ${routine.label}`);
                menu.classList.remove('show');
            });
            
            menu.appendChild(option);
        });
        
        const closeButton = document.createElement('div');
        closeButton.classList.add('movement-menu-close');
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => {
            menu.classList.remove('show');
        });
        menu.appendChild(closeButton);
        
        container.appendChild(menu);
        
        return menu;
    }
    
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
