// Logger and EVENTS will be injected by NavigationController

/**
 * ReviewModeController - Handles review mode functionality for screen reader navigation
 * 
 * Responsibilities:
 * - Toggle between plot and text field focus
 * - Manage review mode state and lifecycle
 * - Coordinate with UI layer for text field display
 * - Handle automatic focus switching
 * - Play appropriate audio cues for focus transitions
 * 
 * Dependencies injected via constructor and setDependencies():
 * - NavigationController (parent coordinator)
 * - UIController (for text field management)
 * - TextController (for content generation)
 * - SonificationController (for audio cues)
 */
export class ReviewModeController {
    constructor() {
        // Core state
        this.isInReviewMode = false;
        this.previousFocusElement = null;
        this.wasNavigationActiveBeforeReview = false;
        
        // Dependencies (injected via setDependencies)
        this.navigationController = null;
        this.uiController = null;
        this.textController = null;
        this.sonificationController = null;
        this.logger = null; // Will be injected by NavigationController
        this.events = null; // Will be injected by NavigationController
        
        // Event listener tracking for cleanup
        this.eventListeners = new Map();
        
        this.logger?.debug('ReviewModeController: Initialized');
    }
    
    /**
     * Set dependencies via dependency injection
     * @param {NavigationController} navigationController - Parent navigation coordinator
     * @param {UIController} uiController - UI layer coordinator
     * @param {TextController} textController - Text and TTS controller
     * @param {SonificationController} sonificationController - Audio feedback controller
     * @param {Object} logger - Logger instance
     * @param {Object} events - Events constants
     */
    setDependencies(navigationController, uiController, textController, sonificationController, logger = null, events = null) {
        this.navigationController = navigationController;
        this.uiController = uiController;
        this.textController = textController;
        this.sonificationController = sonificationController;
        this.logger = logger;
        this.events = events;
        
        this.setupEventListeners();
        
        this.logger?.debug('ReviewModeController: Dependencies injected');
    }
    
    /**
     * Set up event listeners for review mode functionality
     */
    setupEventListeners() {
        // Listen for V key press from text field to exit review mode
        const reviewModeExitHandler = () => {
            this.exitReviewMode();
        };
        
        document.addEventListener('review-mode-exit-from-textfield', reviewModeExitHandler);
        this.eventListeners.set('review-mode-exit', {
            element: document,
            event: 'review-mode-exit-from-textfield',
            handler: reviewModeExitHandler
        });
        
        this.logger?.debug('ReviewModeController: Event listeners set up');
    }
    
    /**
     * Toggle review mode on/off
     * Primary entry point for review mode functionality
     */
    toggleReviewMode() {
        if (this.isInReviewMode) {
            this.exitReviewMode();
        } else {
            this.enterReviewMode();
        }
    }
    
    /**
     * Enter review mode - show text field and automatically focus it
     */
    enterReviewMode() {
        if (this.isInReviewMode) {
            this.logger?.debug('ReviewModeController: Already in review mode');
            return;
        }
        
        this.logger?.debug('ReviewModeController: Entering review mode');
        
        // Store the current focus element (likely the canvas)
        this.previousFocusElement = document.activeElement;
        this.isInReviewMode = true;
        
        // Store navigation active state to preserve it
        if (this.navigationController) {
            this.wasNavigationActiveBeforeReview = this.navigationController.isActive;
        }
        
        // Dispatch event to UI layer to show the text field
        document.dispatchEvent(new CustomEvent(this.events?.REVIEW_MODE_ENTERED || 'review-mode-entered'));
        
        // Generate and update the review text content
        if (this.textController) {
            this.textController.updateReviewModeText();
        }
        
        // Request focus management from the navigation coordinator (proper architecture)
        if (this.navigationController && this.navigationController.focusReviewTextField) {
            this.navigationController.focusReviewTextField();
        } else {
            // Fallback: simple focus
            setTimeout(() => {
                const reviewTextField = document.getElementById('reviewTextField');
                if (reviewTextField) {
                    reviewTextField.focus();
                    reviewTextField.setSelectionRange(0, 0);
                    this.logger?.debug('ReviewModeController: Text field focused (fallback)');
                }
            }, 100);
        }
        
        // Play distinctive "focus out" audio cue (leaving the plot)
        this.playFocusOutAudioCue();
        
        // Announce review mode activation
        if (this.textController) {
            this.textController.announceToScreenReader('Review mode active. Navigate text with arrow keys. Press V to return to the plot.', true);
        }
        
        this.logger?.debug('ReviewModeController: Entered review mode, navigation state preserved');
    }
    
    /**
     * Exit review mode - hide text field and automatically return focus to plot
     */
    exitReviewMode() {
        if (!this.isInReviewMode) {
            this.logger?.debug('ReviewModeController: Not in review mode');
            return;
        }
        
        this.logger?.debug('ReviewModeController: Exiting review mode');
        
        this.isInReviewMode = false;
        
        // Dispatch event to UI layer to hide the text field
        document.dispatchEvent(new CustomEvent(this.events?.REVIEW_MODE_EXITED || 'review-mode-exited'));
        
        // Restore focus to the previous element (usually the canvas) while preserving navigation state
        this.restoreFocusToPlot();
        
        // Clean up state
        this.previousFocusElement = null;
        this.wasNavigationActiveBeforeReview = false;
        
        // Announce review mode deactivation
        if (this.textController) {
            this.textController.announceToScreenReader('Review mode inactive. Navigation restored.', true);
        }
        
        this.logger?.debug('ReviewModeController: Exited review mode, navigation state preserved');
    }
    
    /**
     * Restore focus to the plot canvas with proper visual indicators and navigation state
     * @private
     */
    restoreFocusToPlot() {
        if (!this.previousFocusElement || !this.previousFocusElement.focus) {
            this.logger?.warn('ReviewModeController: No previous focus element to restore');
            return;
        }
        
        // Temporarily disable focus handling in NavigationController to prevent navigation deactivation
        if (this.navigationController) {
            this.navigationController.preventFocusDeactivation = true;
        }
        
        setTimeout(() => {
            // Get the canvas element
            const canvas = document.getElementById('glCanvas');
            
            // Restore navigation state if it was active before review mode
            if (this.navigationController && this.wasNavigationActiveBeforeReview && !this.navigationController.isActive) {
                this.navigationController.isActive = true;
                this.navigationController.wasActivatedByFocus = true; // Mark as focus-activated
            }
            
            // Focus the canvas and ensure visual focus indicator appears
            if (canvas) {
                canvas.focus();
                
                // Use requestAnimationFrame to ensure proper focus handling
                requestAnimationFrame(() => {
                    // Verify focus was successful
                    if (document.activeElement === canvas) {
                        this.logger?.debug('ReviewModeController: Canvas successfully focused after review mode exit');
                        
                        // Force CSS focus styles to be recalculated and ensure visibility
                        const computedStyle = window.getComputedStyle(canvas);
                        const borderColor = computedStyle.borderColor;
                        const boxShadow = computedStyle.boxShadow;
                        this.logger?.debug('ReviewModeController: Canvas focus styles - border:', borderColor, 'shadow:', boxShadow);
                        
                        // If focus styles aren't being applied, temporarily force them
                        if (borderColor === 'rgba(0, 0, 0, 0)' || borderColor === 'transparent') {
                            this.logger?.debug('ReviewModeController: Focus styles not detected, forcing them...');
                            canvas.style.borderColor = '#ffffff';
                            canvas.style.boxShadow = '0 0 0 2px #000000, 0 0 0 5px #ffffff, 0 0 15px rgba(255, 255, 255, 0.5)';
                            
                            // Remove forced styles after a moment to let CSS take over
                            setTimeout(() => {
                                canvas.style.borderColor = '';
                                canvas.style.boxShadow = '';
                            }, 200);
                        }
                        
                        // Trigger focus event manually to ensure all handlers are called
                        canvas.dispatchEvent(new Event('focus', { bubbles: true }));
                        
                        // Play distinctive "focus in" audio cue (returning to the plot)
                        this.playFocusInAudioCue();
                    } else {
                        this.logger?.warn('ReviewModeController: Canvas focus unsuccessful, retrying...');
                        // Retry focus
                        canvas.focus();
                    }
                });
            }
            
            // Re-enable focus handling after a short delay
            setTimeout(() => {
                if (this.navigationController) {
                    this.navigationController.preventFocusDeactivation = false;
                }
            }, 100);
            
            this.logger?.debug('ReviewModeController: Focus restored to canvas, Navigation active:', this.navigationController?.isActive);
        }, 50);
    }
    
    /**
     * Play focus in audio cue (ascending tones for entering the plot)
     * @private
     */
    playFocusInAudioCue() {
        if (this.sonificationController && this.sonificationController.audioContext) {
            // Play ascending three-tone sequence for "focus in"
            this.playToneSequence([300, 400, 500], [0, 0.1, 0.2], 100);
        }
    }
    
    /**
     * Play focus out audio cue (descending tones for leaving the plot)
     * @private
     */
    playFocusOutAudioCue() {
        if (this.sonificationController && this.sonificationController.audioContext) {
            // Play descending three-tone sequence for "focus out"
            this.playToneSequence([500, 400, 300], [0, 0.1, 0.2], 100);
        }
    }
    
    /**
     * Helper method to play a sequence of tones
     * @private
     * @param {number[]} frequencies - Array of frequencies to play
     * @param {number[]} delays - Array of delay times for each frequency
     * @param {number} duration - Duration of each tone in milliseconds
     */
    playToneSequence(frequencies, delays, duration) {
        if (!this.sonificationController || !this.sonificationController.audioContext) return;
        
        const audioContext = this.sonificationController.audioContext;
        
        frequencies.forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + delays[index]);
            
            // Create smooth envelope
            gainNode.gain.setValueAtTime(0, audioContext.currentTime + delays[index]);
            gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + delays[index] + 0.02);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + delays[index] + (duration / 1000));
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(audioContext.currentTime + delays[index]);
            oscillator.stop(audioContext.currentTime + delays[index] + (duration / 1000));
        });
    }
    
    /**
     * Get current review mode state
     * @returns {boolean} True if currently in review mode
     */
    getIsInReviewMode() {
        return this.isInReviewMode;
    }
    
    /**
     * Clean up event listeners to prevent memory leaks
     */
    cleanupEventListeners() {
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
        
        this.logger?.debug('ReviewModeController: Event listeners cleaned up');
    }
    
    /**
     * Destroy the controller and clean up resources
     */
    destroy() {
        // Exit review mode if active to restore focus properly
        if (this.isInReviewMode) {
            this.exitReviewMode();
        }
        
        // Clean up event listeners
        this.cleanupEventListeners();
        
        // Clear dependencies
        this.navigationController = null;
        this.uiController = null;
        this.textController = null;
        this.sonificationController = null;
        
        // Reset state
        this.isInReviewMode = false;
        this.previousFocusElement = null;
        this.wasNavigationActiveBeforeReview = false;
        
        this.logger?.debug('ReviewModeController: Destroyed and cleaned up');
    }
} 