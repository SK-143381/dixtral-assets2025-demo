// Logger and EVENTS will be injected by NavigationController

export class TextController {
    constructor(plotData, ttsController, navigationController = null, uiController = null) {
        this.data = plotData;
        this.displayMode = 'off'; // Can be 'off', 'verbose', 'terse', or 'superTerse'
        this.speechRate = 1.0; // Default speech rate
        this.speechRates = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]; // Predefined speech rates
        this.currentRateIndex = 1; // Start at 1.0x speed
        this.minSpeechRate = 0.5; // Minimum speech rate
        this.maxSpeechRate = 8.0; // Maximum speech rate
        this.displayMaxRate = 4.0; // Maximum rate to display to user
        this.isAdjustingRate = false; // Flag to track if we're adjusting speech rate
        this.ttsController = ttsController;
        
        // Review mode properties
        this.isInReviewMode = false;
        this.previousFocusElement = null; // Store the element that had focus before review mode
        this.reviewModeTarget = null; // Current review target element
        
        // Dependencies for coordinator access
        this.navigationController = navigationController;
        this.uiController = uiController;
        this.logger = null; // Will be injected by NavigationController
        this.events = null; // Will be injected by NavigationController
        
        this.eventListeners = new Map(); // Track event listeners for cleanup
        // Memory management for timers (required by architecture rule #6)
        this.pendingTimeouts = new Map();
        this.timeoutCounter = 0;
        
        // Force re-announcement mechanism using invisible characters
        this.announcementCounter = 0;

        
        this.setupKeyboardControls();
    }
    
    /**
     * Set dependencies after construction (called by NavigationController)
     */
    setDependencies(navigationController, uiController, logger = null, events = null) {
        this.navigationController = navigationController;
        this.uiController = uiController;
        this.logger = logger;
        this.events = events;
    }

    initialize() {
        // TextController initialization is handled in constructor
        this.logger?.info('TextController initialized');
    }

    // Setup keyboard controls for text-related functionality
    setupKeyboardControls() {
        this.logger?.debug('Setting up text controller keyboard controls');
        
        // Remove any existing listeners to prevent duplicates
        this.cleanupEventListeners();
        
        // Create bound event handler
        this.handleKeyDown = (event) => {
            // Don't handle H key - let MenuController handle it exclusively
            if (event.key.toLowerCase() === 'h') {
                return; // Let MenuController handle this
            }
            
            // Handle Ctrl key to interrupt speech
            if (event.ctrlKey && event.key.toLowerCase() === 'control') {
                event.preventDefault();
                if (this.ttsController) {
                    this.ttsController.stopSpeech();
                }
                return;
            }

            // Handle F key to cycle through speech rates
            if (event.key.toLowerCase() === 'f') {
                event.preventDefault();
                // Only cycle rates if text mode is active
                if (this.displayMode !== 'off') {
                    // Cycle to next rate
                    this.currentRateIndex = (this.currentRateIndex + 1) % this.speechRates.length;
                    this.speechRate = this.speechRates[this.currentRateIndex];
                    this.updateSpeechRateDisplay();
                    // Announce the new rate
                    this.speak(`Speech rate set to ${this.speechRate.toFixed(1)} times`);
                }
                return;
            }

            // Handle 'T' key toggle for display modes
            if (event.key.toLowerCase() === 't') {
                event.preventDefault();
                // Cycle through modes: off -> verbose -> terse -> superTerse -> off
                this.displayMode = this.displayMode === 'off' ? 'verbose' : 
                                 this.displayMode === 'verbose' ? 'terse' : 
                                 this.displayMode === 'terse' ? 'superTerse' : 'off';
                this.logger?.debug('Display mode:', this.displayMode);
                
                // Show or hide the speech rate control based on display mode
                this.updateSpeechRateControlVisibility();

                // Announce the new display mode
                let modeAnnouncement = '';
                switch(this.displayMode) {
                    case 'off':
                        modeAnnouncement = 'Text mode off';
                        break;
                    case 'verbose':
                        modeAnnouncement = 'Verbose text mode';
                        break;
                    case 'terse':
                        modeAnnouncement = 'Terse text mode';
                        break;
                    case 'superTerse':
                        modeAnnouncement = 'Super terse text mode';
                        break;
                }
                
                // Always announce to screen readers (works regardless of TTS state)
                // Use assertive to allow quick cycling through modes
                this.announceToScreenReader(modeAnnouncement, true);
                
                // Also use built-in TTS if it's enabled
                this.speak(modeAnnouncement);
                
                // Update the navigation info UI to reflect the new text mode
                if (this.navigationController) {
                    setTimeout(() => this.navigationController.updateNavigationInfo(), 10);
                }
                
                // Update review mode text content if currently in review mode
                this.updateReviewModeText();
                return;
            }
        };

        // Add the event listener and track it
        document.addEventListener('keydown', this.handleKeyDown);
        this.eventListeners.set('keyboard', { element: document, event: 'keydown', handler: this.handleKeyDown });
    }

    // Update speech rate display
    updateSpeechRateDisplay() {
        const valueDisplay = document.getElementById('speechRateValue');
        if (valueDisplay) {
            valueDisplay.textContent = this.speechRate.toFixed(1) + 'x';
        }
        const slider = document.getElementById('speechRateSlider');
        if (slider) {
            slider.value = this.speechRate;
        }
    }

    // Update speech rate control visibility
    updateSpeechRateControlVisibility() {
        const speechRateSection = document.getElementById('speechRateControl');
        if (speechRateSection) {
            speechRateSection.style.display = this.displayMode === 'off' ? 'none' : 'block';
        }
    }

    // Show speech rate control slider
    showSpeechRateControl() {
        const infoElement = document.getElementById('navigationInfo');
        if (!infoElement) return;

        // Create or update speech rate control section
        let speechRateSection = document.getElementById('speechRateControl');
        if (!speechRateSection) {
            speechRateSection = document.createElement('div');
            speechRateSection.id = 'speechRateControl';
            speechRateSection.style.marginTop = '10px';
            speechRateSection.style.padding = '10px';
            speechRateSection.style.border = '1px solid #ccc';
            speechRateSection.style.borderRadius = '5px';
            
            const label = document.createElement('label');
            label.htmlFor = 'speechRateSlider';
            label.textContent = 'Speech Rate: ';
            
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.id = 'speechRateSlider';
            slider.min = Math.min(...this.speechRates).toString();
            slider.max = Math.max(...this.speechRates).toString();
            slider.step = '0.1';
            slider.value = this.speechRate;
            slider.style.width = '200px';
            slider.style.margin = '0 10px';
            
            const valueDisplay = document.createElement('span');
            valueDisplay.id = 'speechRateValue';
            valueDisplay.textContent = this.speechRate.toFixed(1) + 'x';
            
            slider.addEventListener('input', (e) => {
                this.speechRate = parseFloat(e.target.value);
                // Find closest predefined rate
                this.currentRateIndex = this.speechRates.reduce((closest, rate, index) => {
                    return Math.abs(rate - this.speechRate) < Math.abs(this.speechRates[closest] - this.speechRate) ? index : closest;
                }, 0);
                this.speechRate = this.speechRates[this.currentRateIndex];
                this.updateSpeechRateDisplay();
            });
            
            speechRateSection.appendChild(label);
            speechRateSection.appendChild(slider);
            speechRateSection.appendChild(valueDisplay);
            
            // Ensure we're not overwriting content and avoid circular references
            if (speechRateSection.parentNode !== infoElement) {
                infoElement.appendChild(speechRateSection);
            }
        }

        // Update visibility based on current display mode
        this.updateSpeechRateControlVisibility();
    }

    // Update navigation information display
    updateNavigationInfo(navigationController) {
        this.logger?.debug('Updating navigation info');
        const infoElement = document.getElementById('navigationInfo');
        if (!infoElement) {
            this.logger?.error('Navigation info element not found');
            return;
        }

        if (!navigationController.isActive) {
            // Clear all content and show inactive message, but preserve the TTS toggle
            const ttsToggle = infoElement.querySelector('#ttsToggle');
            infoElement.innerHTML = '<p><strong>Navigation Inactive</strong></p><p>Tab to the plot above to activate navigation and access data points</p>';
            if (ttsToggle && ttsToggle.parentNode !== infoElement) {
                infoElement.appendChild(ttsToggle);
            }
            // Ensure TTS toggle is present
            if (this.uiController) {
                this.uiController.setupTTSToggle();
            }
            return;
        }

        // Navigation is active - check if we're in wireframe or point mode
        if (navigationController.isWireframeMode()) {
            // Wireframe mode - use existing wireframe navigation info
            this.updateWireframeNavigationInfo(navigationController);
            return;
        }

        // Point mode navigation - support Y, Z, and X axis navigation
        const navigationAxis = navigationController.navigationAxis;
        const isYNavigation = navigationAxis === 'y';
        const isZNavigation = navigationAxis === 'z';
        const isXNavigation = navigationAxis === 'x';
        
        let currentSegment, currentSegmentIndex, totalSegments, segmentLabel, segmentUnit;
        
        if (isZNavigation) {
            currentSegmentIndex = navigationController.currentZSegment;
            totalSegments = navigationController.zSegments.length;
            currentSegment = navigationController.zSegments[currentSegmentIndex];
            segmentLabel = this.data?.zLabel || 'Z';
            segmentUnit = this.data?.zUnit ? ` ${this.data.zUnit}` : '';
        } else if (isXNavigation) {
            currentSegmentIndex = navigationController.currentXSegment;
            totalSegments = navigationController.xSegments.length;
            currentSegment = navigationController.xSegments[currentSegmentIndex];
            segmentLabel = this.data?.xLabel || 'X';
            segmentUnit = this.data?.xUnit ? ` ${this.data.xUnit}` : '';
        } else {
            currentSegmentIndex = navigationController.currentYSegment;
            totalSegments = navigationController.ySegments.length;
            currentSegment = navigationController.ySegments[currentSegmentIndex];
            segmentLabel = this.data?.yLabel || 'Y';
            segmentUnit = this.data?.yUnit ? ` ${this.data.yUnit}` : '';
        }
        
        const point = navigationController.getCurrentPoint(); // Use the proper method to get current point
        
        let pointInfo = '';
        if (this.displayMode !== 'off' && point) {
            const pointMessage = this.getPointMessage(point);
            if (pointMessage) {
                pointInfo = `<p><strong>Current Point:</strong> ${pointMessage}</p>`;
            }
        }

        // Create or get the navigation content div
        let navInfoContent = infoElement.querySelector('#navInfoContent');
        if (!navInfoContent) {
            navInfoContent = document.createElement('div');
            navInfoContent.id = 'navInfoContent';
            // Clear only the content, preserving the TTS toggle and speech rate control
            const existingContent = Array.from(infoElement.children).filter(
                el => el.id !== 'ttsToggle' && 
                     el.id !== 'speechRateControl' && 
                     !el.parentElement || el.parentElement.id !== 'ttsToggle'
            );
            existingContent.forEach(el => {
                if (el.parentNode === infoElement) {
                    el.remove();
                }
            });
            infoElement.appendChild(navInfoContent);
        }
        
        // Display appropriate segment information
        const axisUpperCase = navigationAxis.toUpperCase();
        let segmentRange, segmentDescription, horizontalNavigation, verticalNavigation;
        
        if (isZNavigation) {
            segmentRange = `${currentSegment.minZ.toFixed(2)} to ${currentSegment.maxZ.toFixed(2)}${segmentUnit}`;
            horizontalNavigation = "X axis (left/right between points)";
            verticalNavigation = "Navigation disabled for Z mode";
            segmentDescription = `All points in this segment have the same Z value (${currentSegment.minZ.toFixed(3)}). Navigate point-by-point within this Z plane by X/Y coordinates.`;
        } else if (isXNavigation) {
            segmentRange = `${currentSegment.minX.toFixed(2)} to ${currentSegment.maxX.toFixed(2)}${segmentUnit}`;
            horizontalNavigation = "Z axis (left=positive Z, right=negative Z)";
            verticalNavigation = "Navigation disabled for X mode";
            segmentDescription = `All points in this segment have the same X value (${currentSegment.minX.toFixed(3)}). Navigate point-by-point within this X plane through Z coordinates.`;
        } else {
            segmentRange = `${currentSegment.minY.toFixed(2)} to ${currentSegment.maxY.toFixed(2)}${segmentUnit}`;
            horizontalNavigation = "X axis (left/right between points)";
            verticalNavigation = "Z axis (up=positive, down=negative values)";
            segmentDescription = `Points grouped by Y value range. Navigate point-by-point within this range by X/Z coordinates.`;
        }
        
        navInfoContent.innerHTML = `
            <p><strong>Point Navigation Active</strong></p>
            <p><strong>Navigation Axis:</strong> ${segmentLabel} (${axisUpperCase})</p>
            <p>${segmentLabel} Segment ${currentSegmentIndex + 1} of ${totalSegments}</p>
            <p>${segmentLabel} range: ${segmentRange}</p>
            <p>Points in segment: ${currentSegment.points.length}</p>
            <p style="font-size: 0.9em; color: #aaa; margin-top: 5px;">${segmentDescription}</p>
            ${pointInfo}
            <div style="margin-top: 10px; padding: 8px; background-color: rgba(52, 73, 94, 0.3); border-radius: 4px;">
                <p><strong>Available Keys:</strong></p>
                <p><strong>N:</strong> Toggle navigation axis (Y→Z→X→Y, currently: ${segmentLabel})</p>
                <p><strong>← →:</strong> Navigate within segment (${horizontalNavigation})</p>
                <p><strong>↑ ↓:</strong> ${verticalNavigation}</p>
                <p><strong>Ctrl+Shift+↑↓:</strong> Navigate between ${segmentLabel} segments</p>
                <p><strong>X/Y/Z:</strong> Announce axis labels</p>
                <p><strong>S:</strong> Toggle sonification audio (currently ${navigationController.sonificationController?.isEnabled ? 'ON' : 'OFF'})</p>
                <p><strong>P:</strong> Toggle autoplay data overview (currently ${navigationController.autoPlayController?.autoplayActive ? 'ACTIVE' : 'OFF'})</p>
                <p><strong>T:</strong> Cycle text display modes (currently: ${this.displayMode})</p>
                <p><strong>V:</strong> Toggle review mode - automatically switches focus between plot and text field</p>
                <p><strong>Enter:</strong> Read current point values</p>
            </div>
        `;
        
        // If display mode is active, ensure the slider is shown
        if (this.displayMode !== 'off') {
            this.showSpeechRateControl();
        }
        // Ensure TTS toggle is present
        if (this.uiController) {
            this.uiController.setupTTSToggle();
            // Also ensure navigation axis toggle is present in point mode
            this.uiController.setupNavigationAxisToggle();
        }
        
        // Update review mode text if currently active
        this.updateReviewModeText();
    }

    // Get the announcement message for a point in the current text mode
    getPointMessage(point) {
        if (!point || this.displayMode === 'off') return null;

        // Get labels and units from the data
        const xLabel = this.data?.xLabel || 'X';
        const yLabel = this.data?.yLabel || 'Y';
        const zLabel = this.data?.zLabel || 'Z';
        const xUnit = this.data?.xUnit || '';
        const yUnit = this.data?.yUnit || '';
        const zUnit = this.data?.zUnit || '';

        switch(this.displayMode) {
            case 'verbose':
                return `${xLabel}: ${point.x.toFixed(1)} ${xUnit}, ` +
                       `${zLabel}: ${point.z.toFixed(2)} ${zUnit}, ` +
                       `${yLabel}: ${point.y.toFixed(3)} ${yUnit}`;
            case 'terse':
                return `X axis: ${point.x.toFixed(1)} ${xUnit}, ` +
                       `Y axis: ${point.y.toFixed(3)} ${yUnit}, ` +
                       `Z axis: ${point.z.toFixed(2)} ${zUnit}`;
            case 'superTerse':
                return `${point.x.toFixed(1)} ${xUnit}, ` +
                       `${point.y.toFixed(3)} ${yUnit}, ` +
                       `${point.z.toFixed(2)} ${zUnit}`;
            default:
                return null;
        }
    }

    // Announcement methods
    announceCurrentPoint(point) {
        const message = this.getPointMessage(point);
        if (message) {
            this.speak(message, true); // Built-in TTS announcement
        }
    }

    // Announce point to screen reader and built-in TTS using the exact same format
    announceCurrentPointToAll(point) {
        const message = this.getPointMessage(point);
        if (message) {
            // Announce to screen reader first with assertive (interrupts previous)
            this.announceToScreenReader(message, true);
            // Also announce with built-in TTS if enabled
            this.speak(message, true);
        }
    }

    /**
     * === WIREFRAME NAVIGATION METHODS ===
     * Methods for handling wireframe rectangle navigation and display
     */

    /**
     * Update navigation info for wireframe mode
     * @param {Object} navigationController - The navigation controller instance
     */
    updateWireframeNavigationInfo(navigationController) {
        console.log('updateWireframeNavigationInfo called');
        const infoElement = document.getElementById('navigationInfo');
        if (!infoElement) {
            console.warn('Navigation info element not found');
            return;
        }

        const currentRect = navigationController.getCurrentWireframeRectangle();
        const totalRects = navigationController.getWireframeRectangleCount();
        const currentIndex = navigationController.currentWireframeRectIndex;
        
        console.log('Wireframe navigation info:', { currentRect, totalRects, currentIndex });
        
        // Get grid information for spatial navigation display
        const xGridPos = navigationController.currentWireframeXIndex || 0;
        const zGridPos = navigationController.currentWireframeZIndex || 0;
        const xGridSize = navigationController.wireframeGrid?.xValues?.length || 0;
        const zGridSize = navigationController.wireframeGrid?.zValues?.length || 0;
        
        let rectInfo = '';
        if (currentRect && this.displayMode !== 'off') {
            // Get labels and units from the data
            const xLabel = this.data?.xLabel || 'X';
            const yLabel = this.data?.yLabel || 'Y';
            const zLabel = this.data?.zLabel || 'Z';
            const xUnit = this.data?.xUnit ? ` ${this.data.xUnit}` : '';
            const yUnit = this.data?.yUnit ? ` ${this.data.yUnit}` : '';
            const zUnit = this.data?.zUnit ? ` ${this.data.zUnit}` : '';
            
            switch(this.displayMode) {
                case 'verbose':
                    rectInfo = `
                        <p>Rectangle Center: ${xLabel}: ${currentRect.center.x.toFixed(1)}${xUnit}, ${zLabel}: ${currentRect.center.z.toFixed(2)}${zUnit}, ${yLabel}: ${currentRect.center.y.toFixed(3)}${yUnit}</p>
                        <p>Average ${yLabel}: ${currentRect.avgY.toFixed(3)}${yUnit}</p>
                    `;
                    break;
                case 'terse':
                    rectInfo = `
                        <p>Center: ${currentRect.center.x.toFixed(1)}${xUnit} | ${currentRect.center.y.toFixed(3)}${yUnit} | ${currentRect.center.z.toFixed(2)}${zUnit}</p>
                    `;
                    break;
                case 'superTerse':
                    rectInfo = `
                        <p>${currentRect.center.x.toFixed(1)}${xUnit} | ${currentRect.center.y.toFixed(3)}${yUnit} | ${currentRect.center.z.toFixed(2)}${zUnit}</p>
                    `;
                    break;
            }
        }
        
        // Create a wrapper for navigation info content
        let navInfoContent = document.getElementById('navInfoContent');
        if (!navInfoContent) {
            navInfoContent = document.createElement('div');
            navInfoContent.id = 'navInfoContent';
            // Clear only the content, preserving the TTS toggle and speech rate control
            const existingContent = Array.from(infoElement.children).filter(
                el => el.id !== 'ttsToggle' && 
                     el.id !== 'speechRateControl' && 
                     !el.parentElement || el.parentElement.id !== 'ttsToggle'
            );
            existingContent.forEach(el => {
                if (el.parentNode === infoElement) {
                    el.remove();
                }
            });
            infoElement.appendChild(navInfoContent);
        }
        
        navInfoContent.innerHTML = `
            <p><strong>Wireframe Navigation Active</strong></p>
            <p>Grid Position: X ${xGridPos + 1}/${xGridSize}, Z ${zGridPos + 1}/${zGridSize}</p>
            <p>Rectangle ${currentIndex + 1} of ${totalRects}</p>
            ${rectInfo}
            <div style="margin-top: 10px; padding: 8px; background-color: rgba(52, 73, 94, 0.3); border-radius: 4px;">
                <p><strong>Available Keys:</strong></p>
                <p><strong>← →:</strong> Navigate along X axis</p>
                <p><strong>↑ ↓:</strong> Navigate along Z axis</p>
                <p><strong>X/Y/Z:</strong> Announce axis labels</p>
                <p><strong>S:</strong> Toggle sonification audio (currently ${navigationController.sonificationController?.isEnabled ? 'ON' : 'OFF'})</p>
                <p><strong>P:</strong> Toggle autoplay data overview (currently ${navigationController.autoPlayController?.autoplayActive ? 'ACTIVE' : 'OFF'})</p>
                <p><strong>T:</strong> Cycle text display modes (currently: ${this.displayMode})</p>
                <p><strong>V:</strong> Toggle review mode - automatically switches focus between plot and text field</p>
                <p><strong>Enter:</strong> Read current rectangle details</p>
            </div>
        `;
        
        // If display mode is active, ensure the slider is shown
        if (this.displayMode !== 'off') {
            this.showSpeechRateControl();
        }
        
        // Update review mode text if currently active
        this.updateReviewModeText();
    }

    // Get the announcement message for a wireframe rectangle in the current text mode
    getWireframeRectangleMessage(rect) {
        if (!rect || this.displayMode === 'off') return null;

        // Get labels and units from the data
        const xLabel = this.data?.xLabel || 'X';
        const yLabel = this.data?.yLabel || 'Y';
        const zLabel = this.data?.zLabel || 'Z';
        const xUnit = this.data?.xUnit || '';
        const yUnit = this.data?.yUnit || '';
        const zUnit = this.data?.zUnit || '';

        switch(this.displayMode) {
            case 'verbose':
                return `Rectangle center: ${xLabel}: ${rect.center.x.toFixed(1)} ${xUnit}, ` +
                       `${zLabel}: ${rect.center.z.toFixed(2)} ${zUnit}, ` +
                       `${yLabel}: ${rect.center.y.toFixed(3)} ${yUnit}. ` +
                       `Average ${yLabel}: ${rect.avgY.toFixed(3)} ${yUnit}`;
            case 'terse':
                return `Rectangle center: ${rect.center.x.toFixed(1)} ${xUnit}, ` +
                       `${rect.center.y.toFixed(3)} ${yUnit}, ` +
                       `${rect.center.z.toFixed(2)} ${zUnit}`;
            case 'superTerse':
                return `${rect.center.x.toFixed(1)} ${xUnit}, ` +
                       `${rect.center.y.toFixed(3)} ${yUnit}, ` +
                       `${rect.center.z.toFixed(2)} ${zUnit}`;
            default:
                return null;
        }
    }

    /**
     * Announce current wireframe rectangle details
     * @param {Object} rect - The wireframe rectangle object
     */
    announceCurrentWireframeRectangle(rect) {
        const message = this.getWireframeRectangleMessage(rect);
        if (message) {
            this.speak(message, true); // Built-in TTS announcement
        }
    }

    // Announce wireframe rectangle to screen reader and built-in TTS using the exact same format
    announceCurrentWireframeRectangleToAll(rect) {
        const message = this.getWireframeRectangleMessage(rect);
        if (message) {
            // Announce to screen reader first with assertive (interrupts previous)
            this.announceToScreenReader(message, true);
            // Also announce with built-in TTS if enabled
            this.speak(message, true);
        }
    }

    // Utility method for speech synthesis
    speak(text, isPointAnnouncement = false) {
        if (this.ttsController) {
            this.ttsController.speak(text, isPointAnnouncement, this.speechRate);
        }
    }

    // Announce to screen readers using dedicated aria-live region
    announceToScreenReader(message, isUrgent = false) {
        // Input validation as required by architecture rule #7
        if (!message || typeof message !== 'string') {
            console.warn('Invalid message for screen reader announcement - must be a non-empty string');
            return;
        }

        const navRegion = document.getElementById('navigation-announcements');
        if (!navRegion) {
            console.warn('Navigation announcements region not found');
            return;
        }

        // Force re-announcement by making each message technically unique
        // Use invisible zero-width space characters that increment each time
        // This ensures screen readers will announce the same content multiple times
        this.announcementCounter = (this.announcementCounter + 1) % 1000; // Reset every 1000 to prevent overflow
        const invisibleSuffix = '\u200B'.repeat(this.announcementCounter % 5 + 1); // 1-5 zero-width spaces
        const uniqueMessage = message + invisibleSuffix;
        
        // Set the unique message immediately
        navRegion.textContent = uniqueMessage;
        
        // Schedule cleanup of the announcement
        const cleanupTimeoutId = this.timeoutCounter++;
        const cleanupTimeout = setTimeout(() => {
            navRegion.textContent = '';
            // Clean up this timeout from tracking
            this.pendingTimeouts.delete(cleanupTimeoutId);
        }, isUrgent ? 1500 : 3000); // Longer timeout to ensure announcement completes
        
        // Track timeout for memory management (required by architecture rule #6)
        this.pendingTimeouts.set(cleanupTimeoutId, cleanupTimeout);
    }

    /**
     * Generate concise text content for the review text field
     * Shows only essential current position information
     */
    generateReviewModeText() {
        if (!this.navigationController || !this.navigationController.isActive) {
            return 'Navigation is not active. Tab to the plot above to activate navigation.';
        }

        // Check if we're in wireframe or point mode
        if (this.navigationController.isWireframeMode()) {
            return this.generateWireframeReviewText();
        } else {
            return this.generatePointReviewText();
        }
    }

    /**
     * Generate concise review text for point navigation mode
     */
    generatePointReviewText() {
        const point = this.navigationController.getCurrentPoint();
        
        if (!point) {
            return 'No current point selected.';
        }
        
        const xLabel = this.data?.xLabel || 'X';
        const yLabel = this.data?.yLabel || 'Y';
        const zLabel = this.data?.zLabel || 'Z';
        const xUnit = this.data?.xUnit || '';
        const yUnit = this.data?.yUnit || '';
        const zUnit = this.data?.zUnit || '';
        
        // Format as single line with essential values
        return `Current Point: ${xLabel}: ${point.x.toFixed(1)} ${xUnit}, ${yLabel}: ${point.y.toFixed(3)} ${yUnit}, ${zLabel}: ${point.z.toFixed(2)} ${zUnit}`;
    }

    /**
     * Generate concise review text for wireframe navigation mode
     */
    generateWireframeReviewText() {
        const currentRect = this.navigationController.getCurrentWireframeRectangle();
        
        if (!currentRect) {
            return 'No current rectangle selected.';
        }
        
        const xLabel = this.data?.xLabel || 'X';
        const yLabel = this.data?.yLabel || 'Y';
        const zLabel = this.data?.zLabel || 'Z';
        const xUnit = this.data?.xUnit || '';
        const yUnit = this.data?.yUnit || '';
        const zUnit = this.data?.zUnit || '';
        
        // Format as single line with essential values including average
        return `Current Rectangle: ${xLabel}: ${currentRect.center.x.toFixed(1)} ${xUnit}, ${yLabel}: ${currentRect.center.y.toFixed(3)} ${yUnit}, ${zLabel}: ${currentRect.center.z.toFixed(2)} ${zUnit}, Average ${yLabel}: ${currentRect.avgY.toFixed(3)} ${yUnit}`;
    }

    /**
     * Update review mode text content and dispatch event for UI layer
     */
    updateReviewModeText() {
        const reviewText = this.generateReviewModeText();
        
        // Dispatch event for UI layer to update the text field
        document.dispatchEvent(new CustomEvent(this.events?.REVIEW_MODE_TEXT_UPDATED || 'review-mode-text-updated', {
            detail: { text: reviewText }
        }));
    }

    /**
     * Clean up event listeners to prevent memory leaks
     */
    cleanupEventListeners() {
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
    }

    /**
     * Clean up event listeners and timers to prevent memory leaks (required by architecture rule #6)
     */
    destroy() {
        this.cleanupEventListeners();
        // Exit review mode if active to restore focus properly
        if (this.isInReviewMode) {
            this.exitReviewMode();
        }
        
        if (this.handleKeyDown) {
            document.removeEventListener('keydown', this.handleKeyDown);
            this.handleKeyDown = null;
        }
       
        // Clear review mode properties
        this.previousFocusElement = null;
        this.reviewModeTarget = null;

        this.logger?.info('TextController destroyed and cleaned up');
    }
}
