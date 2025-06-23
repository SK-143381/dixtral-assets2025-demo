// MenuController.js - Help menu management with H key toggle
// Logger will be injected by UIController

export class MenuController {
    constructor() {
        this.helpMenu = null;
        this.closeButton = null;
        this.helpMenuTitle = null;
        this.screenReaderAnnouncement = null;
        this.lastFocusedElement = null;
        this.isMenuOpen = false;
        this.hasAnnouncedHelpShortcut = false; // Track if help shortcut has been announced
        this.logger = null; // Will be injected by UIController
        
        // Bound event handler for cleanup
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }
    
    setDependencies({ logger }) {
        this.logger = logger;
        this.logger?.info('MenuController: Initialized');
    }

    async initialize() {
        this.logger?.info('MenuController: Starting initialization');
        
        // Get DOM elements
        this.helpMenu = document.getElementById('helpMenu');
        this.closeButton = document.querySelector('.close-help');
        this.helpMenuTitle = document.getElementById('helpMenuTitle');
        this.screenReaderAnnouncement = document.getElementById('screen-reader-announcement');
        
        if (!this.helpMenu) {
            this.logger?.error('MenuController: Help menu element not found!');
            return;
        }
        
        this.logger?.debug('MenuController: DOM elements found, setting up event listeners');
        this.setupEventListeners();
        this.announceHelpShortcut();
        
        console.log('MenuController: Initialization complete');
    }

    setupEventListeners() {
        // Global H key listener - highest priority capture
        document.addEventListener('keydown', this.handleKeyDown, true);
        
        // Close button click
        if (this.closeButton) {
            this.closeButton.addEventListener('click', () => {
                console.log('MenuController: Close button clicked');
                this.closeMenu();
            });
        }

        // Click outside to close
        if (this.helpMenu) {
            this.helpMenu.addEventListener('click', (event) => {
                if (event.target === this.helpMenu) {
                    console.log('MenuController: Clicked outside menu, closing');
                    this.closeMenu();
                }
            });
        }

        console.log('MenuController: Event listeners set up');
    }

    handleKeyDown(event) {
        // Handle H key for menu toggle
        if (event.key.toLowerCase() === 'h') {
            // Don't trigger in input fields
            const isInputField = event.target.tagName === 'INPUT' || 
                               event.target.tagName === 'TEXTAREA' || 
                               event.target.isContentEditable;
            
            if (!isInputField) {
                console.log('MenuController: H key pressed, toggling menu');
                event.preventDefault();
                event.stopPropagation();
                this.toggleMenu();
                return;
            }
        }

        // Handle Escape key to close menu
        if (event.key === 'Escape' && this.isMenuOpen) {
            console.log('MenuController: Escape key pressed, closing menu');
            event.preventDefault();
            event.stopPropagation();
            this.closeMenu();
        }
    }

    toggleMenu() {
        console.log('MenuController: Toggling menu, current state:', this.isMenuOpen);
        
        if (this.isMenuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        console.log('MenuController: Opening menu');
        
        if (!this.helpMenu) {
            console.error('MenuController: Cannot open menu - helpMenu element not found');
            return;
        }

        // Store current focus
        this.lastFocusedElement = document.activeElement;
        
        // Prevent scrolling on body (for Mac and other platforms)
        document.body.style.overflow = 'hidden';
        
        // Lower axes labels z-index when help menu is open
        const axesLabelsContainer = document.getElementById('axes-labels');
        if (axesLabelsContainer) {
            axesLabelsContainer.style.zIndex = '999';
        }
        
        // Show menu
        this.helpMenu.setAttribute('aria-hidden', 'false');
        this.isMenuOpen = true;
        
        // Force display style to ensure visibility
        this.helpMenu.style.display = 'flex';
        
        console.log('MenuController: Menu display set to flex, aria-hidden set to false, scrolling disabled');
        
        // Focus the menu title after a short delay
        setTimeout(() => {
            if (this.helpMenuTitle) {
                this.helpMenuTitle.setAttribute('tabindex', '-1');
                this.helpMenuTitle.focus();
                console.log('MenuController: Menu opened and focused on title');
            }
        }, 100);

        // Announce to screen readers
        this.announceToScreenReader('Help menu opened.');
    }

    closeMenu() {
        console.log('MenuController: Closing menu');
        
        if (!this.helpMenu) {
            console.error('MenuController: Cannot close menu - helpMenu element not found');
            return;
        }

        // Re-enable scrolling on body
        document.body.style.overflow = '';
        
        // Restore axes labels z-index when help menu is closed
        const axesLabelsContainer = document.getElementById('axes-labels');
        if (axesLabelsContainer) {
            axesLabelsContainer.style.zIndex = '1000';
        }

        // Hide menu
        this.helpMenu.setAttribute('aria-hidden', 'true');
        this.helpMenu.style.display = 'none';
        this.isMenuOpen = false;
        
        console.log('MenuController: Menu display set to none, aria-hidden set to true, scrolling re-enabled');
        
        // Restore focus to previous element
        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
            this.lastFocusedElement = null;
            console.log('MenuController: Focus restored to previous element');
        }

        // Announce to screen readers
        this.announceToScreenReader('Help menu closed.');
    }

    announceToScreenReader(message) {
        if (this.screenReaderAnnouncement) {
            this.screenReaderAnnouncement.textContent = message;
            console.log('MenuController: Screen reader announcement:', message);
        }
    }

    announceHelpShortcut() {
        // Only announce help shortcut once to prevent repeated announcements
        if (!this.hasAnnouncedHelpShortcut) {
            setTimeout(() => {
                this.announceToScreenReader('Press H for help menu.');
                this.hasAnnouncedHelpShortcut = true;
            }, 2000);
        }
    }

    // Cleanup method
    destroy() {
        if (this.handleKeyDown) {
            document.removeEventListener('keydown', this.handleKeyDown, true);
        }
        console.log('MenuController: Event listeners removed');
    }

    // Status method for debugging
    getStatus() {
        return {
            isMenuOpen: this.isMenuOpen,
            helpMenuExists: !!this.helpMenu,
            helpMenuAriaHidden: this.helpMenu?.getAttribute('aria-hidden'),
            helpMenuDisplay: this.helpMenu?.style.display
        };
    }
}
