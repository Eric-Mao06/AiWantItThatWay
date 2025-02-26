    // Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
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
    
    // Set up the greeting based on time of day
    updateGreeting();
    
    // Set up event listeners
    closeBtn.addEventListener('click', () => {
        window.close();
    });
    
    // Handle Tab key for suggestions
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault(); // Prevent default tab behavior
            
            // Add completion effect
            const completionEffect = document.createElement('div');
            completionEffect.classList.add('completion-effect');
            tabSuggestion.appendChild(completionEffect);
            
            // Add active class to tab suggestion
            tabSuggestion.classList.add('active');
            
            // Remove effect and class after animation completes
            setTimeout(() => {
                completionEffect.remove();
                tabSuggestion.classList.remove('active');
            }, 1000);
        }
        
        // Show input box when spacebar is pressed
        if (e.key === ' ' && !inputContainer.classList.contains('active')) {
            e.preventDefault(); // Prevent default space behavior
            
            // Show input box
            inputContainer.classList.remove('hidden');
            inputHint.classList.add('hidden');
            inputField.focus();
            inputContainer.classList.add('active');
            
            // Expand container
            container.classList.add('expanded');
            
            // Notify main process to resize window
            if (window.electron) {
                window.electron.send('resize-window', { expanded: true });
            }
        }
        
        // Hide input box when Escape is pressed
        if (e.key === 'Escape' && inputContainer.classList.contains('active')) {
            // Hide input box
            inputContainer.classList.add('hidden');
            inputHint.classList.remove('hidden');
            inputContainer.classList.remove('active');
            
            // Collapse container
            container.classList.remove('expanded');
            
            // Notify main process to resize window
            if (window.electron) {
                window.electron.send('resize-window', { expanded: false });
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
    
    function rotateHeroMessages() {
        heroText.style.opacity = 0;
        
        setTimeout(() => {
            currentHeroIndex = (currentHeroIndex + 1) % heroMessages.length;
            heroText.textContent = heroMessages[currentHeroIndex];
            heroText.style.opacity = 1;
        }, 500);
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
});
