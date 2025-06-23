// DarkModeController.js - Manages dark mode theme switching
// Logger will be injected by UIController

export class DarkModeController {
    constructor() {
        this.darkModeToggle = document.getElementById('darkModeToggle');
        this.toggleIcon = this.darkModeToggle?.querySelector('.dark-mode-toggle-icon');
        this.toggleText = this.darkModeToggle?.querySelector('.dark-mode-toggle-text');
        this.isDarkMode = false;
        this.logger = null; // Will be injected by UIController
        
        this.initialize();
    }
    
    setDependencies({ logger }) {
        this.logger = logger;
        this.logger?.debug('DarkModeController constructor:', {
            darkModeToggle: !!this.darkModeToggle,
            toggleIcon: !!this.toggleIcon,
            toggleText: !!this.toggleText
        });
    }

    initialize() {
        console.log('DarkModeController.initialize() called');
        // Check for system preference and stored preference
        this.detectSystemPreference();
        this.setupEventListeners();
        
        console.log('Dark mode controller initialized');
    }

    detectSystemPreference() {
        // Check if user has a stored preference
        const storedTheme = localStorage.getItem('surfaceplot-theme');
        
        if (storedTheme) {
            this.isDarkMode = storedTheme === 'dark';
        } else {
            // Check system preference
            this.isDarkMode = window.matchMedia && 
                             window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        
        this.applyTheme();
        
        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                // Only auto-switch if no manual preference is stored
                if (!localStorage.getItem('surfaceplot-theme')) {
                    this.isDarkMode = e.matches;
                    this.applyTheme();
                }
            });
        }
    }

    setupEventListeners() {
        if (this.darkModeToggle) {
            this.darkModeToggle.addEventListener('click', () => {
                this.toggleDarkMode();
            });
            
            // Remove the old keyboard support for Enter and Space on the button
            // Instead, add global keyboard support for "m" key
        }
        
        // Add global keyboard listener for "m" key
        this.handleKeyDown = (event) => {
            console.log('DarkModeController received key:', event.key);
            if (event.key.toLowerCase() === 'm') {
                console.log('DarkModeController handling M key');
                event.preventDefault();
                this.toggleDarkMode();
            }
        };
        
        document.addEventListener('keydown', this.handleKeyDown);
        console.log('DarkModeController: Added keydown event listener for M key');
    }

    toggleDarkMode() {
        this.isDarkMode = !this.isDarkMode;
        this.applyTheme();
        this.savePreference();
        
        // Remove focus from the button after toggle
        if (this.darkModeToggle && document.activeElement === this.darkModeToggle) {
            this.darkModeToggle.blur();
        }
        
        // Announce the change for screen readers
        this.announceThemeChange();
    }

    applyTheme() {
        const theme = this.isDarkMode ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        
        if (this.darkModeToggle) {
            // Update button state
            this.darkModeToggle.setAttribute('aria-pressed', this.isDarkMode.toString());
            
            // Update button text and icon
            if (this.toggleIcon) {
                this.toggleIcon.textContent = this.isDarkMode ? '☀️' : '🌙';
            }
            
            if (this.toggleText) {
                this.toggleText.textContent = this.isDarkMode ? 'Light Mode' : 'Dark Mode';
            }
        }
        
        console.log(`Applied ${theme} theme`);
    }

    savePreference() {
        const theme = this.isDarkMode ? 'dark' : 'light';
        localStorage.setItem('surfaceplot-theme', theme);
    }

    announceThemeChange() {
        // Create a temporary element to announce the theme change
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `Switched to ${this.isDarkMode ? 'dark' : 'light'} mode`;
        
        document.body.appendChild(announcement);
        
        // Remove the announcement after it's been read
        setTimeout(() => {
            if (announcement.parentNode) {
                document.body.removeChild(announcement);
            }
        }, 1000);
    }

    // Method to get current theme for other components
    getCurrentTheme() {
        return this.isDarkMode ? 'dark' : 'light';
    }

    // Method to check if dark mode is active
    isDarkModeActive() {
        return this.isDarkMode;
    }
    
    // Cleanup method to remove event listeners
    destroy() {
        if (this.handleKeyDown) {
            document.removeEventListener('keydown', this.handleKeyDown);
        }
    }
}
