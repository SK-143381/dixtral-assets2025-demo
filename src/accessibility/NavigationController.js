// NavigationController.js - Coordinates between different accessibility controllers
import { SonificationController } from './SonificationController.js';
import { TextController } from './TextController.js';
import { TTSController } from './TTSController.js';
import { GamepadController } from './GamepadController.js';
import { HighlightController } from './HighlightController.js';
import { ReviewModeController } from './ReviewModeController.js';
import { AutoPlayController } from './AutoPlayController.js';
import { EVENTS } from '../constants/EventConstants.js';
import { AccessibilityLogger } from '../utils/Logger.js';

export class NavigationController {
    constructor(visualizationEngine, plotData) {
        this.engine = visualizationEngine;
        this.data = plotData;
        this.currentYSegment = 0;
        this.currentXIndex = 0;  // Generic X coordinate index
        this.currentZIndex = 0;  // Generic Z coordinate index
        this.ySegments = [];
        this.isActive = false;
        this.wasActivatedByFocus = false; // Track if navigation was activated by canvas focus
        
        // Navigation axis toggle (Y-axis, Z-axis, or X-axis for point mode)
        this.navigationAxis = 'y'; // 'y', 'z', or 'x' - default to Y-axis navigation
        this.currentZSegment = 0;  // For Z-axis navigation
        this.zSegments = [];       // Z-axis segments for navigation
        this.currentXSegment = 0;  // For X-axis navigation
        this.xSegments = [];       // X-axis segments for navigation
        
        // Event listeners tracking for cleanup
        this.eventListeners = new Map();
        
        // Wireframe navigation properties - independent from point navigation
        this.wireframeNavigationMode = false;
        this.currentWireframeRectIndex = 0;
        this.wireframeRectangles = [];
        this.currentWireframeXIndex = 0; // X position in wireframe grid
        this.currentWireframeZIndex = 0; // Z position in wireframe grid
        this.wireframeGrid = null; // 2D grid for spatial wireframe navigation
        
        // Focus handling state
        this.preventFocusDeactivation = false;
        
        // Initialize accessibility controllers internally
        this.sonificationController = null;
        this.textController = null;
        this.ttsController = null;
        this.gamepadController = null;
        this.highlightController = null;
        this.reviewModeController = null;
        this.autoPlayController = null;
        

        
        // Bind focus/blur handlers
        this.handleCanvasFocus = this.handleCanvasFocus.bind(this);
        this.handleCanvasBlur = this.handleCanvasBlur.bind(this);
    }

    async initialize() {
        try {
            AccessibilityLogger.info('Initializing Navigation system with accessibility controllers');

            // Initialize highlighting controller first (engine dependency)
            this.highlightController = new HighlightController(this.engine);
            this.highlightController.setDependencies(this.data);
            // Make highlight controller available to engine for buffer generation
            this.engine.highlightController = this.highlightController;
            await this.highlightController.initialize();

            // Initialize sonification
            this.sonificationController = new SonificationController();
            this.sonificationController.setDependencies(this.data, null, null, null, AccessibilityLogger); // Text controller will be set later
            await this.sonificationController.initialize();

            // Initialize TTS controller
            this.ttsController = new TTSController();
            this.ttsController.initialize();

            // Initialize text controller with TTS integration
            this.textController = new TextController(this.data, this.ttsController);
            this.textController.setDependencies(this, null, AccessibilityLogger, EVENTS); // UI controller will be set later by app.js
            this.textController.initialize();
            
            // Set text controller, highlight controller, and navigation controller dependencies on sonification controller
            this.sonificationController.setDependencies(this.data, this.textController, this.highlightController, this, AccessibilityLogger);

            // Initialize gamepad controller
            this.gamepadController = new GamepadController(this.engine);
            await this.gamepadController.initialize();

            // Initialize review mode controller
            this.reviewModeController = new ReviewModeController();
            
            // Initialize autoplay controller with dependency injection
            this.autoPlayController = new AutoPlayController();
            this.autoPlayController.setDependencies({
                audioContext: this.sonificationController.audioContext,
                dataController: this.data,
                textController: this.textController,
                highlightController: this.highlightController,
                navigationController: this,
                sonificationController: this.sonificationController,
                logger: AccessibilityLogger,
                events: EVENTS
            });
            await this.autoPlayController.initialize();
            
            // Set up controller coordination
            this.gamepadController.setControllers(
                this,
                this.textController,
                this.ttsController
            );

            // Set up keyboard controls
            this.setupKeyboardControls();
            
            // Set up canvas focus handling for automatic navigation activation
            this.setupCanvasFocusHandling();
            
            // Setup navigation axis toggle event listener
            this.setupNavigationAxisToggle();
            // Setup display mode announcement event listener
            this.setupDisplayModeAnnouncement();

            if (this.data.zValues && this.data.zValues.length > 0) {
                this.createZSegments();
                this.createXSegments();
                this.updateNavigationInfo();
            }
            
            AccessibilityLogger.info('Navigation system initialized with all accessibility controllers');
        } catch (error) {
            AccessibilityLogger.error('Failed to initialize NavigationController:', error);
            throw error;
        }
    }
    
    /**
     * Set dependencies for review mode controller after all controllers are initialized
     * Called by app.js after UI controller is available
     */
    setReviewModeDependencies(uiController) {
        if (this.reviewModeController) {
            this.reviewModeController.setDependencies(
                this,
                uiController,
                this.textController,
                this.sonificationController,
                AccessibilityLogger,
                EVENTS
            );
            AccessibilityLogger.debug('NavigationController: Review mode dependencies set');
        }
    }

    /**
     * Focus management for review text field (coordinator responsibility)
     * Called by ReviewModeController to maintain proper architecture
     */
    focusReviewTextField() {
        AccessibilityLogger.debug('NavigationController: Managing review text field focus');
        
        setTimeout(() => {
            const reviewTextField = document.getElementById('reviewTextField');
            if (reviewTextField) {
                // Enhanced focus management for caret visibility
                reviewTextField.focus();
                reviewTextField.setSelectionRange(0, 0);
                
                // Force caret visibility by triggering a focus cycle
                reviewTextField.blur();
                setTimeout(() => {
                    reviewTextField.focus();
                    reviewTextField.setSelectionRange(0, 0);
                    
                    // Ensure caret is visible by simulating click at beginning
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        clientX: reviewTextField.getBoundingClientRect().left + 10,
                        clientY: reviewTextField.getBoundingClientRect().top + reviewTextField.getBoundingClientRect().height / 2
                    });
                    reviewTextField.dispatchEvent(clickEvent);
                    
                    AccessibilityLogger.debug('NavigationController: Review text field focused with enhanced caret visibility');
                }, 50);
            }
        }, 150);
    }

    setupNavigationAxisToggle() {
        const toggleHandler = () => {
            // Only toggle if we're in point mode (not wireframe mode)
            if (!this.isWireframeMode() && this.isActive) {
                this.toggleNavigationAxis();
            }
        };
        
        document.addEventListener(EVENTS.NAVIGATION_AXIS_TOGGLE_REQUESTED, toggleHandler);
        this.eventListeners.set('navigation-axis-toggle', {
            element: document,
            event: EVENTS.NAVIGATION_AXIS_TOGGLE_REQUESTED,
            handler: toggleHandler
        });


    }

    setupDisplayModeAnnouncement() {
        const announcementHandler = (event) => {
            const { displayMode } = event.detail;
            this.announceDisplayModeChange(displayMode);
        };
        
        document.addEventListener(EVENTS.DISPLAY_MODE_ANNOUNCEMENT_REQUESTED, announcementHandler);
        this.eventListeners.set('display-mode-announcement', {
            element: document,
            event: EVENTS.DISPLAY_MODE_ANNOUNCEMENT_REQUESTED,
            handler: announcementHandler
        });
    }
    
    announceDisplayModeChange(displayMode) {
        const modeNames = {
            'surface': 'Surface mode',
            'points': 'Points mode'
        };
        
        const announcement = modeNames[displayMode] || `${displayMode} mode`;
        
        // Announce to screen readers using polite live region (not interrupting)
        if (this.textController) {
            this.textController.announceToScreenReader(announcement);
        }
        
        // Only announce with built-in TTS if it's explicitly enabled
        if (this.ttsController && this.ttsController.isEnabled) {
            this.ttsController.speak(announcement);
        }
    }

    toggleNavigationAxis() {
        if (this.isWireframeMode()) {
            // Don't toggle in wireframe mode
            AccessibilityLogger.debug('Navigation axis toggle blocked - wireframe mode active');
            return;
        }
        
        const previousAxis = this.navigationAxis;
        AccessibilityLogger.debug(`[Navigation Toggle] Current axis: ${previousAxis}`);
        
        // Cycle through Y → Z → X → Y
        if (this.navigationAxis === 'y') {
            this.navigationAxis = 'z';
        } else if (this.navigationAxis === 'z') {
            this.navigationAxis = 'x';
        } else {
            this.navigationAxis = 'y';
        }
        
        AccessibilityLogger.debug(`[Navigation Toggle] New axis: ${this.navigationAxis} (${previousAxis} → ${this.navigationAxis})`);
        
        // Recreate segments for the new axis
        if (this.navigationAxis === 'z') {
            this.createZSegments();
            // Reset to first Z segment
            this.currentZSegment = 0;
            this.resetPositionInSegment('z');
        } else if (this.navigationAxis === 'x') {
            this.createXSegments();
            // Reset to first X segment
            this.currentXSegment = 0;
            this.resetPositionInSegment('x');
        } else {
            this.createYSegments();
            // Reset to first Y segment
            this.currentYSegment = 0;
            this.resetPositionInSegment('y');
        }
        
        // Update navigation info
        this.updateNavigationInfo();
        
        // Force buffer recreation to update highlighting
        if (this.engine) {
            this.engine.createBuffers();
        }
        
        // Announce the change
        if (this.textController) {
            const axisName = this.navigationAxis.toUpperCase();
            let axisLabel;
            if (this.navigationAxis === 'z') {
                axisLabel = this.data?.zLabel || 'Z';
            } else if (this.navigationAxis === 'x') {
                axisLabel = this.data?.xLabel || 'X';
            } else {
                axisLabel = this.data?.yLabel || 'Y';
            }
            this.textController.announceToScreenReader(`Navigation axis changed to ${axisLabel} (${axisName})`);
        }
        
        // Dispatch event for UI updates
        document.dispatchEvent(new CustomEvent(EVENTS.NAVIGATION_AXIS_CHANGED, {
            detail: { axis: this.navigationAxis }
        }));
        
        // Play current point sound
        this.playCurrentPointSound();
    }

    // Set up canvas focus handling for automatic navigation activation
    setupCanvasFocusHandling() {
        const canvas = document.getElementById('glCanvas');
        if (!canvas) {
            AccessibilityLogger.warn('Canvas element not found for focus handling');
            return;
        }

        AccessibilityLogger.debug('Setting up canvas focus handling for automatic navigation activation');
        AccessibilityLogger.debug('Canvas element found:', canvas);
        AccessibilityLogger.debug('Canvas tabindex:', canvas.getAttribute('tabindex'));
        AccessibilityLogger.debug('Canvas role:', canvas.getAttribute('role'));

        // Add focus event listener
        canvas.addEventListener('focus', this.handleCanvasFocus);
        
        // Add blur event listener 
        canvas.addEventListener('blur', this.handleCanvasBlur);
        
        // Add debugging click listener to test if canvas is interactive
        canvas.addEventListener('click', () => {
            AccessibilityLogger.debug('Canvas clicked - this confirms canvas is interactive');
        });
        
        // The canvas already has comprehensive aria-label and role="application" in HTML
        AccessibilityLogger.debug('Canvas focus handling setup complete');
        
        // Add a global test function for debugging
        window.testCanvasFocus = () => {
            AccessibilityLogger.debug('Testing canvas focus programmatically...');
            AccessibilityLogger.debug('Canvas current focus state:', document.activeElement === canvas);
            canvas.focus();
            AccessibilityLogger.debug('Focus called. New active element:', document.activeElement);
            AccessibilityLogger.debug('Canvas now focused?', document.activeElement === canvas);
        };
        
        AccessibilityLogger.debug('Debug function added: window.testCanvasFocus() - call this in console to test focus');
    }

    handleCanvasFocus(event) {
        AccessibilityLogger.debug('Canvas received focus - activating navigation mode');
        AccessibilityLogger.debug('Focus event:', event);
        AccessibilityLogger.debug('Active element:', document.activeElement);
        AccessibilityLogger.debug('Is canvas focused?', document.activeElement === document.getElementById('glCanvas'));
        
        // Only activate if not already active
        if (!this.isActive) {
            this.isActive = true;
            this.wasActivatedByFocus = true;
            
            AccessibilityLogger.info('Navigation activated via focus');
            
            // Check if we're in wireframe mode and initialize accordingly
            if (this.isWireframeMode()) {
                AccessibilityLogger.debug('Initializing wireframe navigation');
                this.initializeWireframeNavigation();
                // Force update navigation info for wireframe mode
                setTimeout(() => {
                    this.updateWireframeNavigationInfo();
                }, 100);
            } else {
                // Set up initial position for point navigation
                AccessibilityLogger.debug('Initializing point navigation');
                this.resetPositionInSegment();
                this.updateNavigationInfo();
            }
            
            // Force immediate visual highlight by triggering buffer recreation
            if (this.engine && this.highlightController) {
                AccessibilityLogger.debug('Forcing buffer recreation for immediate highlight visibility');
                this.engine.createBuffers();
            }
            
            // Play distinctive "focus in" audio cue
            this.playFocusInAudioCue();
            
            // Announce navigation activation to screen readers
            this.announceNavigationActivation();
        } else {
            AccessibilityLogger.debug('Navigation already active, not re-activating');
        }
    }

    handleCanvasBlur(event) {
        AccessibilityLogger.debug('Canvas lost focus');
        
        // Don't deactivate navigation if we're in review mode
        const isInReviewMode = this.reviewModeController ? this.reviewModeController.getIsInReviewMode() : false;
        if (isInReviewMode) {
            console.log('Canvas blur ignored - in review mode');
            return;
        }
        
        // Don't deactivate if we're temporarily preventing focus deactivation
        if (this.preventFocusDeactivation) {
            console.log('Canvas blur ignored - focus deactivation prevented');
            return;
        }
        
        // Only deactivate if it was activated by focus (not manual 'S' key)
        if (this.isActive && this.wasActivatedByFocus) {
            AccessibilityLogger.info('Deactivating navigation mode (was activated by focus)');
            
            this.isActive = false;
            this.wasActivatedByFocus = false;
            
            // Clear highlights
            this.updateNavigationInfo();
            
            // Force buffer recreation to remove Y segment highlighting
            if (this.engine) {
                AccessibilityLogger.debug('Recreating buffers to remove Y segment highlighting');
                this.engine.createBuffers();
            }
            
            // Play distinctive "focus out" audio cue
            this.playFocusOutAudioCue();
            
            // Announce navigation deactivation
            this.announceNavigationDeactivation();
        }
    }

    announceNavigationActivation() {
        // Brief announcement to screen readers that application mode is now active
        const message = 'Navigation active. Use arrow keys.';
        
        // Use text controller for announcement if available
        if (this.textController) {
            this.textController.announceToScreenReader(message);
        }
        
        // Also use TTS if enabled
        if (this.ttsController && this.ttsController.enabled) {
            this.ttsController.speak(message);
        }
        
        AccessibilityLogger.debug('Announced navigation activation:', message);
    }

    announceNavigationDeactivation() {
        // Brief announcement to screen readers that application mode is deactivated
        const message = 'Navigation inactive.';
        
        // Use text controller for announcement if available
        if (this.textController) {
            this.textController.announceToScreenReader(message);
        }
        
        AccessibilityLogger.debug('Announced navigation deactivation:', message);
    }

    // Play distinctive audio cue when focusing into the plot
    playFocusInAudioCue() {
        if (this.sonificationController && this.sonificationController.audioContext) {
            // Play ascending three-tone sequence for "focus in"
            this.playToneSequence([300, 400, 500], [0, 0.1, 0.2], 100);
        }
    }

    // Play distinctive audio cue when focusing out of the plot
    playFocusOutAudioCue() {
        if (this.sonificationController && this.sonificationController.audioContext) {
            // Play descending three-tone sequence for "focus out"
            this.playToneSequence([500, 400, 300], [0, 0.1, 0.2], 100);
        }
    }

    // Helper method to play a sequence of tones
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

    // Called when new data is loaded
    onDataLoaded() {
        this.createYSegments();
        this.createZSegments(); // Also create Z segments
        this.createXSegments(); // Also create X segments
        
        // Check if we're in wireframe mode and initialize accordingly
        if (this.isWireframeMode()) {
            this.initializeWireframeNavigation();
            // Force update navigation info for wireframe mode
            if (this.isActive) this.updateWireframeNavigationInfo();
        }
        
        // CRITICAL FIX: Don't call updateNavigationInfo during data loading
        // as it can interfere with normal rendering when navigation is not active
        // Only update navigation info if navigation is currently active
        if (this.isActive) {
            this.updateNavigationInfo();
        }
        // If navigation is not active, the info will be updated when it becomes active
    }

    // Cluster points by similar Y values using adaptive algorithm
    clusterPointsByYValue(sortedPoints) {
        if (sortedPoints.length === 0) return [];
        
        const clusters = [];
        const minPointsPerSegment = 5; // Minimum points per segment
        const maxSegments = 20; // Maximum number of segments to create
        
        // Calculate Y value range and determine appropriate threshold
        const yValues = sortedPoints.map(p => p.y);
        const yRange = Math.max(...yValues) - Math.min(...yValues);
        
        // Use adaptive threshold based on data distribution
        let threshold = yRange / 15; // Start with range/15 as base threshold
        
        // If threshold is too small (leading to too many segments), increase it
        const uniqueYValues = [...new Set(yValues)];
        if (uniqueYValues.length > maxSegments) {
            threshold = yRange / maxSegments;
        }
        
        AccessibilityLogger.debug(`Y clustering: range=${yRange.toFixed(3)}, threshold=${threshold.toFixed(3)}, unique values=${uniqueYValues.length}`);
        
        let currentCluster = [sortedPoints[0]];
        let clusterStartY = sortedPoints[0].y;
        
        for (let i = 1; i < sortedPoints.length; i++) {
            const point = sortedPoints[i];
            const yDiff = point.y - clusterStartY;
            
            // If Y difference exceeds threshold, start new cluster
            if (yDiff > threshold) {
                // Only add cluster if it has minimum points, otherwise merge with previous
                if (currentCluster.length >= minPointsPerSegment || clusters.length === 0) {
                    clusters.push(currentCluster);
                    currentCluster = [point];
                    clusterStartY = point.y;
                } else {
                    // Merge small cluster with previous one
                    if (clusters.length > 0) {
                        clusters[clusters.length - 1] = clusters[clusters.length - 1].concat(currentCluster);
                    }
                    currentCluster = [point];
                    clusterStartY = point.y;
                }
            } else {
                // Add point to current cluster
                currentCluster.push(point);
            }
        }
        
        // Add the last cluster
        if (currentCluster.length > 0) {
            if (currentCluster.length >= minPointsPerSegment || clusters.length === 0) {
                clusters.push(currentCluster);
            } else {
                // Merge small final cluster with previous one
                if (clusters.length > 0) {
                    clusters[clusters.length - 1] = clusters[clusters.length - 1].concat(currentCluster);
                } else {
                    clusters.push(currentCluster);
                }
            }
        }
        
        return clusters;
    }

    // Create Y segments with 2D grid structure for navigation
    createYSegments() {
        const totalPoints = this.data.yValues.length;
        
        if (totalPoints === 0) {
            this.ySegments = [];
            return;
        }

        // Create an array of all points with their indices
        const allPoints = [];
        for (let i = 0; i < totalPoints; i++) {
            allPoints.push({
                x: this.data.xValues[i],
                z: this.data.zValues[i],
                y: this.data.yValues[i],
                index: i
            });
        }

        // Sort points by Y value (ascending)
        allPoints.sort((a, b) => a.y - b.y);

        // Group similar Y values into segments using adaptive clustering
        const ySegments = this.clusterPointsByYValue(allPoints);
        
        // Create segment objects
        this.ySegments = ySegments.map((segmentPoints, index) => {
            const yValues = segmentPoints.map(p => p.y);
            return {
                minY: Math.min(...yValues),
                maxY: Math.max(...yValues),
                points: segmentPoints,
                grid: null
            };
        });

        // Create 2D grids for each segment (X/Z navigation within same Y range)
        this.ySegments.forEach((segment, index) => {
            if (segment.points.length > 0) {
                segment.grid = this.create2DGrid(segment);
            }
        });

        AccessibilityLogger.debug(`Created ${this.ySegments.length} Y segments with adaptive clustering`);
        this.ySegments.forEach((segment, index) => {
            const range = segment.maxY === segment.minY ? 
                `Y=${segment.minY.toFixed(3)}` : 
                `Y=${segment.minY.toFixed(3)} to ${segment.maxY.toFixed(3)}`;
            AccessibilityLogger.debug(`Y segment ${index}: ${range}, ${segment.points.length} points`);
        });
    }

    // Create Z segments with 2D grid structure for navigation
    // Each segment contains only points with the same Z value
    createZSegments() {
        const totalPoints = this.data.zValues.length;
        
        if (totalPoints === 0) {
            this.zSegments = [];
            return;
        }

        // Create an array of all points with their indices
        const allPoints = [];
        for (let i = 0; i < totalPoints; i++) {
            allPoints.push({
                x: this.data.xValues[i],
                z: this.data.zValues[i],
                y: this.data.yValues[i],
                index: i
            });
        }

        // Group points by unique Z values
        const zGroupMap = new Map();
        allPoints.forEach(point => {
            const zValue = point.z;
            if (!zGroupMap.has(zValue)) {
                zGroupMap.set(zValue, []);
            }
            zGroupMap.get(zValue).push(point);
        });

        // Convert to array and sort by Z value (descending - positive to negative)
        const uniqueZValues = Array.from(zGroupMap.keys()).sort((a, b) => b - a);
        
        // Create segments - one for each unique Z value
        this.zSegments = uniqueZValues.map(zValue => {
            const points = zGroupMap.get(zValue);
            return {
                minZ: zValue,
                maxZ: zValue, // Same Z value for all points in segment
                points: points,
                grid: null
            };
        });

        // Create 2D grids for each segment (X/Y navigation within same Z)
        this.zSegments.forEach((segment, index) => {
            if (segment.points.length > 0) {
                segment.grid = this.create2DGridForZSegment(segment);
            }
        });

        console.log(`Created ${this.zSegments.length} Z segments based on unique Z values`);
        this.zSegments.forEach((segment, index) => {
            console.log(`Z segment ${index}: Z=${segment.minZ.toFixed(3)}, ${segment.points.length} points`);
        });
    }

    createXSegments() {
        const totalPoints = this.data.xValues.length;
        
        if (totalPoints === 0) {
            this.xSegments = [];
            return;
        }

        // Create an array of all points with their indices
        const allPoints = [];
        for (let i = 0; i < totalPoints; i++) {
            allPoints.push({
                x: this.data.xValues[i],
                z: this.data.zValues[i],
                y: this.data.yValues[i],
                index: i
            });
        }

        // Group points by unique X values
        const xGroupMap = new Map();
        allPoints.forEach(point => {
            const xValue = point.x;
            if (!xGroupMap.has(xValue)) {
                xGroupMap.set(xValue, []);
            }
            xGroupMap.get(xValue).push(point);
        });

        // Convert to array and sort by X value (ascending - negative to positive)
        const uniqueXValues = Array.from(xGroupMap.keys()).sort((a, b) => a - b);
        
        // Create segments - one for each unique X value
        this.xSegments = uniqueXValues.map(xValue => {
            const points = xGroupMap.get(xValue);
            return {
                minX: xValue,
                maxX: xValue, // Same X value for all points in segment
                points: points,
                grid: null
            };
        });

        // Create 2D grids for each segment (Y/Z navigation within same X)
        this.xSegments.forEach((segment, index) => {
            if (segment.points.length > 0) {
                segment.grid = this.create2DGridForXSegment(segment);
            }
        });

        console.log(`Created ${this.xSegments.length} X segments based on unique X values`);
        this.xSegments.forEach((segment, index) => {
            console.log(`X segment ${index}: X=${segment.minX.toFixed(3)}, ${segment.points.length} points`);
        });
    }

    // Create 2D navigation grid for a segment (works for both Y and Z segments)
    create2DGrid(segment) {
        if (segment.points.length === 0) {
            segment.grid = { xValues: [], zValues: [], pointMap: new Map() };
            return segment.grid;
        }

        // Get unique X and Z values, sorted
        const xValues = [...new Set(segment.points.map(p => p.x))].sort((a, b) => a - b);
        const zValues = [...new Set(segment.points.map(p => p.z))].sort((a, b) => a - b);

        // Create a map for quick point lookup: "x,z" -> point
        const pointMap = new Map();
        segment.points.forEach(point => {
            const key = `${point.x},${point.z}`;
            pointMap.set(key, point);
        });

        segment.grid = {
            xValues,
            zValues,
            pointMap
        };

        return segment.grid;
    }

    // Create 2D navigation grid for Z segments (X/Y navigation within same Z plane)
    create2DGridForZSegment(segment) {
        if (segment.points.length === 0) {
            segment.grid = { xValues: [], yValues: [], pointMap: new Map() };
            return segment.grid;
        }

        // For Z segments, we navigate by X and Y coordinates (since Z is constant)
        // Get unique X and Y values, sorted
        const xValues = [...new Set(segment.points.map(p => p.x))].sort((a, b) => a - b);
        const yValues = [...new Set(segment.points.map(p => p.y))].sort((a, b) => a - b);

        // Create a map for quick point lookup: "x,y" -> point
        const pointMap = new Map();
        segment.points.forEach(point => {
            const key = `${point.x},${point.y}`;
            pointMap.set(key, point);
        });

        segment.grid = {
            xValues,
            yValues, // Y values instead of Z values for Z segments
            pointMap
        };

        console.log(`Z segment grid: ${xValues.length} X values, ${yValues.length} Y values, ${pointMap.size} points`);
        return segment.grid;
    }

    // Create 2D navigation grid for X segments (Z navigation within same X plane)
    create2DGridForXSegment(segment) {
        if (segment.points.length === 0) {
            segment.grid = { zValues: [], pointMap: new Map() };
            return segment.grid;
        }

        // For X segments, we navigate by Z coordinates only (since X is constant)
        // Get unique Z values, sorted (descending for positive to negative navigation)
        const zValues = [...new Set(segment.points.map(p => p.z))].sort((a, b) => b - a);

        // Create a map for quick point lookup: "z" -> point
        const pointMap = new Map();
        segment.points.forEach(point => {
            const key = `${point.z}`;
            if (!pointMap.has(key)) {
                pointMap.set(key, point);
            }
        });

        segment.grid = {
            zValues, // Z values for X segments (only Z navigation)
            pointMap
        };

        console.log(`X segment grid: ${zValues.length} Z values, ${pointMap.size} points`);
        return segment.grid;
    }

    // Get current point using 2D coordinates (supports Y, Z, and X axis navigation)
    getCurrentPoint() {
        if (this.navigationAxis === 'z') {
            // Z-axis navigation: navigate by X/Y coordinates within the same Z plane
            if (this.currentZSegment >= 0 && this.currentZSegment < this.zSegments.length) {
                const zSegment = this.zSegments[this.currentZSegment];
                const grid = zSegment.grid;
                
                if (grid && 
                    this.currentXIndex >= 0 && this.currentXIndex < grid.xValues.length &&
                    this.currentZIndex >= 0 && this.currentZIndex < grid.yValues.length) {
                    
                    const x = grid.xValues[this.currentXIndex];
                    const y = grid.yValues[this.currentZIndex]; // currentZIndex maps to Y coordinate in Z navigation
                    const key = `${x},${y}`;
                    
                    return grid.pointMap.get(key) || null;
                }
            }
        } else if (this.navigationAxis === 'x') {
            // X-axis navigation: navigate by Z coordinates within the same X plane
            if (this.currentXSegment >= 0 && this.currentXSegment < this.xSegments.length) {
                const xSegment = this.xSegments[this.currentXSegment];
                const grid = xSegment.grid;
                
                if (grid && 
                    this.currentZIndex >= 0 && this.currentZIndex < grid.zValues.length) {
                    
                    const z = grid.zValues[this.currentZIndex]; // currentZIndex maps to Z coordinate in X navigation
                    const key = `${z}`;
                    
                    return grid.pointMap.get(key) || null;
                }
            }
        } else {
            // Y-axis navigation: navigate by X/Z coordinates within the same Y range
            if (this.currentYSegment >= 0 && this.currentYSegment < this.ySegments.length) {
                const ySegment = this.ySegments[this.currentYSegment];
                const grid = ySegment.grid;
                
                if (grid && 
                    this.currentXIndex >= 0 && this.currentXIndex < grid.xValues.length &&
                    this.currentZIndex >= 0 && this.currentZIndex < grid.zValues.length) {
                    
                    const x = grid.xValues[this.currentXIndex];
                    const z = grid.zValues[this.currentZIndex];
                    const key = `${x},${z}`;
                    
                    return grid.pointMap.get(key) || null;
                }
            }
        }
        return null;
    }

    // Get current segment (Y, Z, or X depending on navigation axis)
    getCurrentSegment() {
        if (this.navigationAxis === 'z') {
            if (this.currentZSegment >= 0 && this.currentZSegment < this.zSegments.length) {
                return this.zSegments[this.currentZSegment];
            }
        } else if (this.navigationAxis === 'x') {
            if (this.currentXSegment >= 0 && this.currentXSegment < this.xSegments.length) {
                return this.xSegments[this.currentXSegment];
            }
        } else {
            if (this.currentYSegment >= 0 && this.currentYSegment < this.ySegments.length) {
                return this.ySegments[this.currentYSegment];
            }
        }
        return null;
    }

    // Get current segment point indices (supports Y, Z, and X navigation)
    getCurrentSegmentPointIndices() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.points) {
            return new Set();
        }
        
        return new Set(segment.points.map(point => point.index));
    }

    // Helper method to reset position when switching segments (supports both axes)
    resetPositionInSegment(axis = null) {
        const targetAxis = axis || this.navigationAxis;
        this.currentXIndex = 0;
        this.currentZIndex = 0;
        
        // Find the first valid point in the segment
        const segment = this.getCurrentSegment();
        if (segment && segment.grid) {
            let found = false;
            
            if (targetAxis === 'z') {
                // Z navigation: search X,Y coordinates within same Z plane
                if (segment.grid.yValues.length > 0) {
                    for (let xIndex = 0; xIndex < segment.grid.xValues.length && !found; xIndex++) {
                        for (let yIndex = 0; yIndex < segment.grid.yValues.length && !found; yIndex++) {
                            if (this.tryMoveToPosition(xIndex, yIndex)) {
                                found = true;
                                console.log(`Reset to position (X:${this.currentXIndex}, Y:${this.currentZIndex}) in Z segment ${this.currentZSegment} (Z=${segment.minZ.toFixed(3)})`);
                            }
                        }
                    }
                }
            } else if (targetAxis === 'x') {
                // X navigation: search Z coordinates within same X plane
                if (segment.grid.zValues.length > 0) {
                    for (let zIndex = 0; zIndex < segment.grid.zValues.length && !found; zIndex++) {
                        if (this.tryMoveToPosition(0, zIndex)) { // X navigation only uses zIndex
                            found = true;
                            console.log(`Reset to position (Z:${this.currentZIndex}) in X segment ${this.currentXSegment} (X=${segment.minX.toFixed(3)})`);
                        }
                    }
                }
            } else {
                // Y navigation: search X,Z coordinates within same Y range
                if (segment.grid.zValues.length > 0) {
                    for (let xIndex = 0; xIndex < segment.grid.xValues.length && !found; xIndex++) {
                        for (let zIndex = 0; zIndex < segment.grid.zValues.length && !found; zIndex++) {
                            if (this.tryMoveToPosition(xIndex, zIndex)) {
                                found = true;
                                console.log(`Reset to position (X:${this.currentXIndex}, Z:${this.currentZIndex}) in Y segment ${this.currentYSegment} (Y=${segment.minY.toFixed(3)})`);
                            }
                        }
                    }
                }
            }
            
            if (!found) {
                let segmentInfo;
                if (targetAxis === 'z') {
                    segmentInfo = `Z segment ${this.currentZSegment} (Z=${segment.minZ.toFixed(3)})`;
                } else if (targetAxis === 'x') {
                    segmentInfo = `X segment ${this.currentXSegment} (X=${segment.minX.toFixed(3)})`;
                } else {
                    segmentInfo = `Y segment ${this.currentYSegment} (Y=${segment.minY.toFixed(3)})`;
                }
                console.warn(`No valid points found in ${segmentInfo}`);
            }
        }
    }

    // Setup keyboard controls for navigation
    setupKeyboardControls() {
        AccessibilityLogger.debug('Setting up 2D navigation keyboard controls');
        
        // Remove any existing listeners to prevent duplicates
        document.removeEventListener('keydown', this.handleKeyDown);
        
        // Create bound event handler
        this.handleKeyDown = (event) => {
            
            // When canvas has focus and navigation is active, we're in application mode
            // Prevent screen reader shortcuts from interfering
            const canvas = document.getElementById('glCanvas');
            const canvasHasFocus = canvas && document.activeElement === canvas;
            
            // Allow certain keys to pass through to other controllers
            const allowedKeys = ['m', 'c']; // M for dark mode, C for TTS
            if (allowedKeys.includes(event.key.toLowerCase())) {
                AccessibilityLogger.debug('NavigationController: Allowing key to pass through:', event.key);
                return; // Let other controllers handle these keys
            }
            
            // Don't handle H key - let MenuController handle it exclusively  
            if (event.key.toLowerCase() === 'h') {
                return; // Let MenuController handle this
            }
            
            // Handle 'P' key for autoplay toggle
            if (event.key.toLowerCase() === 'p') {
                event.preventDefault();
                if (this.autoPlayController) {
                    AccessibilityLogger.debug('P key pressed - toggling autoplay');
                    this.autoPlayController.toggleAutoplay();
                    
                    // Update the navigation info to show the new state
                    setTimeout(() => this.updateNavigationInfo(), 10);
                } else {
                    AccessibilityLogger.warn('NavigationController: AutoPlayController not available for autoplay');
                }
                return;
            }

            // Handle 'I' key for intelligent fast autoplay (only when autoplay is active)
            if (event.key.toLowerCase() === 'i') {
                event.preventDefault();
                if (this.autoPlayController) {
                    AccessibilityLogger.debug('I key pressed - switching to fast intelligent autoplay');
                    this.autoPlayController.switchToFastAutoplay();
                    
                    // Update the navigation info to show the new state
                    setTimeout(() => this.updateNavigationInfo(), 10);
                } else {
                    AccessibilityLogger.warn('NavigationController: AutoPlayController not available for fast autoplay');
                }
                return;
            }
            
            // Handle 'N' key for navigation axis toggle (only in point mode)
            if (event.key.toLowerCase() === 'n') {
                event.preventDefault();
                console.log(`N key pressed - wireframe mode: ${this.isWireframeMode()}, navigation active: ${this.isActive}`);
                if (!this.isWireframeMode() && this.isActive) {
                    AccessibilityLogger.debug('N key pressed - toggling navigation axis')
                    this.toggleNavigationAxis();
                } else {
                    console.log('N key conditions NOT met - toggle blocked');
                }
                return;
            }
            
            // Handle 'V' key for review mode toggle (works from anywhere for automatic focus switching)
            if (event.key.toLowerCase() === 'v') {
                event.preventDefault();
                AccessibilityLogger.debug('V key pressed - delegating to ReviewModeController');
                if (this.reviewModeController) {
                    this.reviewModeController.toggleReviewMode();
                }
                return;
            }
            
            // Handle 'S' key for sonification toggle only (not navigation activation)
            if (event.key.toLowerCase() === 's') {
                event.preventDefault();
                // Toggle sonification without affecting navigation state
                if (this.sonificationController) {
                    AccessibilityLogger.debug('S key pressed - toggling sonification audio feedback');
                    AccessibilityLogger.debug('Sonification controller available:', !!this.sonificationController);
                    AccessibilityLogger.debug('Current enabled state:', this.sonificationController.isEnabled);
                    this.sonificationController.toggleEnabled();
                    AccessibilityLogger.debug('New enabled state:', this.sonificationController.isEnabled);
                    
                    // Update the navigation info to show the new state
                    setTimeout(() => this.updateNavigationInfo(), 10);
                } else {
                    AccessibilityLogger.error('Sonification controller not available');
                }
                return;
            }
            
            // Don't handle T key - let TextController handle it exclusively
            if (event.key.toLowerCase() === 't') {
                return; // Let TextController handle this
            }

            // Only process arrow keys if navigation is active AND not in review mode
            const isInReviewMode = this.reviewModeController ? this.reviewModeController.getIsInReviewMode() : false;
            if (!this.isActive || isInReviewMode) return;

            // Handle X, Y, Z keys for direct axis label announcements (available globally)
            if (['x', 'y', 'z'].includes(event.key.toLowerCase())) {
                event.preventDefault();
                event.stopPropagation();
                
                // Dispatch appropriate event using constants
                const axis = event.key.toLowerCase();
                const eventName = axis === 'x' ? EVENTS.ANNOUNCE_X_LABEL :
                                 axis === 'y' ? EVENTS.ANNOUNCE_Y_LABEL :
                                 EVENTS.ANNOUNCE_Z_LABEL;
                
                // Announce the corresponding axis label
                this.announceAxisLabel(axis);
                
                // Also dispatch event for other components that might need to know
                document.dispatchEvent(new CustomEvent(eventName, {
                    detail: { axis, timestamp: Date.now() }
                }));
                return;
            }

            // Only process arrow keys if navigation is active
            if (!this.isActive) return;

            // Handle wireframe navigation if in wireframe mode
            if (this.isWireframeMode() && this.wireframeNavigationMode) {
                switch(event.key) {
                    case 'ArrowLeft':
                        event.preventDefault();
                        event.stopPropagation();
                        this.moveWireframeXBackward(); // Move left along X axis (reversed)
                        break;
                    case 'ArrowRight':
                        event.preventDefault();
                        event.stopPropagation();
                        this.moveWireframeXForward(); // Move right along X axis (reversed)
                        break;
                    case 'ArrowUp':
                        event.preventDefault();
                        event.stopPropagation();
                        this.moveWireframeZBackward(); // Move forward along Z axis
                        break;
                    case 'ArrowDown':
                        event.preventDefault();
                        event.stopPropagation();
                        this.moveWireframeZForward(); // Move backward along Z axis
                        break;
                    case 'Enter':
                        event.preventDefault();
                        event.stopPropagation();
                        const currentRect = this.getCurrentWireframeRectangle();
                        if (currentRect && this.textController) {
                            // Announce current wireframe rectangle details
                            this.textController.announceCurrentWireframeRectangleToAll(currentRect);
                        }
                        break;
                }
                return; // Exit early for wireframe mode
            }

            // Point navigation mode - handle both Y and Z axis navigation
            // Use Ctrl+Shift for segment navigation to avoid conflicts
            const isSegmentNavigation = event.ctrlKey && event.shiftKey;
            // Disable Ctrl+Shift shortcuts when in surface display mode
            const isSurfaceMode = this.isWireframeMode();

            switch(event.key) {
                case 'ArrowUp':
                    // Always prevent default for arrow keys in application mode
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSegmentNavigation && !isSurfaceMode) {
                        // Ctrl + Shift + Up: Move to next segment (higher values) - disabled in surface mode
                        if (this.navigationAxis === 'z') {
                            this.moveToNextZSegment();
                        } else if (this.navigationAxis === 'x') {
                            this.moveToNextXSegment();
                        } else {
                            this.moveToNextYSegment();
                        }
                    } else if (!isSegmentNavigation) {
                        // Up: Move towards higher Y values in different navigation modes
                        if (this.navigationAxis === 'y') {
                            // Y-axis navigation mode: Move towards more positive Z values
                            this.moveZForward();
                        } else if (this.navigationAxis === 'x') {
                            // X-axis navigation mode: Move towards higher Y values with same X,Z
                            this.moveYForwardInXMode();
                        } else if (this.navigationAxis === 'z') {
                            // Z-axis navigation mode: Move towards higher Y values with same X,Z
                            this.moveYForwardInZMode();
                        }
                    }
                    // If in surface mode and using Ctrl+Shift, do nothing
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSegmentNavigation && !isSurfaceMode) {
                        // Ctrl + Shift + Down: Move to previous segment (lower values) - disabled in surface mode
                        if (this.navigationAxis === 'z') {
                            this.moveToPreviousZSegment();
                        } else if (this.navigationAxis === 'x') {
                            this.moveToPreviousXSegment();
                        } else {
                            this.moveToPreviousYSegment();
                        }
                    } else if (!isSegmentNavigation) {
                        // Down: Move towards lower Y values in different navigation modes
                        if (this.navigationAxis === 'y') {
                            // Y-axis navigation mode: Move towards more negative Z values
                            this.moveZBackward();
                        } else if (this.navigationAxis === 'x') {
                            // X-axis navigation mode: Move towards lower Y values with same X,Z
                            this.moveYBackwardInXMode();
                        } else if (this.navigationAxis === 'z') {
                            // Z-axis navigation mode: Move towards lower Y values with same X,Z
                            this.moveYBackwardInZMode();
                        }
                    }
                    // If in surface mode and using Ctrl+Shift, do nothing
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    event.stopPropagation();
                    if (!isSegmentNavigation) {
                        if (this.navigationAxis === 'x') {
                            // X navigation: Left moves to lower Z values (negative Z)
                            this.moveZBackwardInXMode();
                        } else {
                            // Y and Z navigation: Left moves to higher X coordinate (positive X)
                            this.moveXBackward();
                        }
                    }
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    event.stopPropagation();
                    if (!isSegmentNavigation) {
                        if (this.navigationAxis === 'x') {
                            // X navigation: Right moves to higher Z values (positive Z)
                            this.moveZForwardInXMode();
                        } else {
                            // Y and Z navigation: Right moves to lower X coordinate (negative X)
                            this.moveXForward();
                        }
                    }
                    break;
                case 'Enter':
                    // Prevent Enter from activating other elements when in application mode
                    event.preventDefault();
                    event.stopPropagation();
                    const currentPoint = this.getCurrentPoint();
                    if (currentPoint) {
                        // Always announce the current point when navigation is active
                        if (this.textController) {
                            this.textController.announceCurrentPointToAll(currentPoint);
                        }
                        // Also play Y-value-based sonification sound
                        if (this.sonificationController) {
                            this.sonificationController.sonifyPointByYValue(currentPoint);
                        }
                    }
                    break;
            }
        };

        // Add the event listener and track it for cleanup
        document.addEventListener('keydown', this.handleKeyDown);
        this.eventListeners.set('keyboard-handler', {
            element: document,
            event: 'keydown',
            handler: this.handleKeyDown
        });
    }

    // Update navigation information display
    updateNavigationInfo() {
        // Handle wireframe navigation mode separately
        if (this.isWireframeMode() && this.wireframeNavigationMode) {
            // Check navigation active state and call appropriate TextController method
            if (this.textController) {
                if (this.isActive) {
                    this.updateWireframeNavigationInfo();
                } else {
                    // Use the standard updateNavigationInfo method which handles inactive state
                    this.textController.updateNavigationInfo(this);
                }
            }
            
            // Update wireframe highlighting based on active state
            if (this.highlightController) {
                if (this.isActive) {
                    // Enable wireframe highlighting when navigation is active
                    this.highlightController.setWireframeHighlightEnabled(true);
                } else {
                    // Disable wireframe highlighting when navigation is not active
                    console.log('Navigation inactive - disabling wireframe highlighting');
                    this.highlightController.setWireframeHighlightEnabled(false);
                }
            }
            return;
        }
        
        // Original point navigation logic
        if (this.textController) {
            this.textController.updateNavigationInfo(this);
        }
        
        // Update highlight for current point only if navigation is active
        // CRITICAL FIX: Don't interfere with normal rendering when navigation is inactive
        if (this.highlightController) {
            if (this.isActive) {
                // Enable highlighting when navigation is active
                this.highlightController.setEnabled(true);
                
                const currentPoint = this.getCurrentPoint();
                if (currentPoint) {
                    // Use the point's original index for direct highlighting
                    console.log(`[DEBUG] NavigationController: Highlighting point index ${currentPoint.index}`);
                    this.highlightController.setHighlightedPoint(currentPoint.index);
                } else {
                    // Clear highlight if no current point
                    this.highlightController.clearHighlight();
                }
            } else {
                // When navigation is not active, simply clear highlights without affecting rendering
                // Don't disable the entire highlight controller to avoid interfering with normal rendering
                console.log('Navigation inactive - clearing highlights but preserving normal rendering');
                this.highlightController.clearHighlight();
                // Note: We don't call setEnabled(false) here to avoid affecting buffer creation
            }
        }
    }

    // Get current Y segment
    getCurrentYSegment() {
        if (this.currentYSegment >= 0 && this.currentYSegment < this.ySegments.length) {
            return this.ySegments[this.currentYSegment];
        }
        return null;
    }

    /**
     * Debug method to visualize the point distribution in the current Y segment
     */
    debugCurrentYSegmentStructure() {
        const currentYSegment = this.getCurrentYSegment();
        if (!currentYSegment || !currentYSegment.grid) {
            console.log('❌ No valid current Y segment');
            return;
        }

        const grid = currentYSegment.grid;
        console.log(`\n🔍 Y Segment ${this.currentYSegment} Structure:`);
        console.log(`   X values: [${grid.xValues.map(x => x.toFixed(1)).join(', ')}]`);
        console.log(`   Z values: [${grid.zValues.map(z => z.toFixed(1)).join(', ')}]`);
        console.log(`   Total grid positions: ${grid.xValues.length} × ${grid.zValues.length} = ${grid.xValues.length * grid.zValues.length}`);
        console.log(`   Actual points: ${grid.pointMap.size}`);
        
        // Create a visual map of where points exist
        console.log('\n📍 Point Distribution Map:');
        console.log('   Z\\X  ' + grid.xValues.map((x, i) => i.toString().padStart(2)).join(' '));
        
        for (let zIndex = 0; zIndex < grid.zValues.length; zIndex++) {
            let row = `${zIndex.toString().padStart(4)} `;
            for (let xIndex = 0; xIndex < grid.xValues.length; xIndex++) {
                const x = grid.xValues[xIndex];
                const z = grid.zValues[zIndex];
                const key = `${x},${z}`;
                row += grid.pointMap.has(key) ? ' ●' : ' ○';
            }
            console.log(row);
        }
        
        // Identify clusters
        this.identifyClusters(grid);
    }

    /**
     * Identify separate clusters in the current layer
     */
    identifyClusters(grid) {
        const visited = new Set();
        const clusters = [];
        
        console.log('\n🎯 Cluster Analysis:');
        
        for (let xIndex = 0; xIndex < grid.xValues.length; xIndex++) {
            for (let zIndex = 0; zIndex < grid.zValues.length; zIndex++) {
                const key = `${xIndex},${zIndex}`;
                if (grid.pointMap.has(`${grid.xValues[xIndex]},${grid.zValues[zIndex]}`) && !visited.has(key)) {
                    const cluster = this.exploreCluster(grid, xIndex, zIndex, visited);
                    clusters.push(cluster);
                }
            }
        }
        
        console.log(`   Found ${clusters.length} separate clusters:`);
        clusters.forEach((cluster, i) => {
            const xCoords = cluster.map(pos => grid.xValues[pos.x]).sort((a, b) => a - b);
            const zCoords = cluster.map(pos => grid.zValues[pos.z]).sort((a, b) => a - b);
            console.log(`   Cluster ${i + 1}: ${cluster.length} points, X: ${xCoords[0].toFixed(1)}-${xCoords[xCoords.length - 1].toFixed(1)}, Z: ${zCoords[0].toFixed(1)}-${zCoords[zCoords.length - 1].toFixed(1)}`);
        });
        
        return clusters;
    }

    /**
     * Explore a cluster using flood-fill algorithm
     */
    exploreCluster(grid, startX, startZ, visited) {
        const cluster = [];
        const stack = [{x: startX, z: startZ}];
        
        while (stack.length > 0) {
            const {x, z} = stack.pop();
            const key = `${x},${z}`;
            
            if (visited.has(key)) continue;
            if (x < 0 || x >= grid.xValues.length || z < 0 || z >= grid.zValues.length) continue;
            if (!grid.pointMap.has(`${grid.xValues[x]},${grid.zValues[z]}`)) continue;
            
            visited.add(key);
            cluster.push({x, z});
            
            // Add adjacent positions (4-directional connectivity)
            stack.push({x: x + 1, z}, {x: x - 1, z}, {x, z: z + 1}, {x, z: z - 1});
        }
        
        return cluster;
    }

    // Navigation methods for Y segments
    moveToNextYSegment() {
        if (this.currentYSegment < this.ySegments.length - 1) {
            this.currentYSegment++;
            this.resetPositionInSegment();
            console.log(`Moved to Y segment ${this.currentYSegment + 1} of ${this.ySegments.length}`);
            this.updateNavigationInfo();
            
            // Force buffer recreation to update Y segment highlighting
            if (this.engine) {
                console.log('Recreating buffers for Y segment highlighting update');
                this.engine.createBuffers();
            }
            
            this.playCurrentPointSound();
        } else {
            // At the highest Y segment - play boundary sound
            console.log(`Y segment boundary reached - at highest Y segment ${this.currentYSegment + 1}`);
            this.playBoundarySound();
        }
    }

    moveToPreviousYSegment() {
        if (this.currentYSegment > 0) {
            this.currentYSegment--;
            this.resetPositionInSegment();
            console.log(`Moved to Y segment ${this.currentYSegment + 1} of ${this.ySegments.length}`);
            this.updateNavigationInfo();
            
            // Force buffer recreation to update Y segment highlighting
            if (this.engine) {
                console.log('Recreating buffers for Y segment highlighting update');
                this.engine.createBuffers();
            }
            
            this.playCurrentPointSound();
        } else {
            // At the lowest Y segment - play boundary sound
            console.log(`Y segment boundary reached - at lowest Y segment ${this.currentYSegment + 1}`);
            this.playBoundarySound();
        }
    }

    // Navigation methods for Z segments
    moveToNextZSegment() {
        if (this.currentZSegment < this.zSegments.length - 1) {
            this.currentZSegment++;
            this.resetPositionInSegment('z');
            this.updateNavigationInfo();
            
            // Force buffer recreation to update segment highlighting
            if (this.engine) {
                this.engine.createBuffers();
            }
            
            this.playCurrentPointSound();
        } else {
            // At the highest Z segment - play boundary sound
            this.playBoundarySound();
        }
    }

    moveToPreviousZSegment() {
        if (this.currentZSegment > 0) {
            this.currentZSegment--;
            this.resetPositionInSegment('z');
            this.updateNavigationInfo();
            
            // Force buffer recreation to update segment highlighting
            if (this.engine) {
                this.engine.createBuffers();
            }
            
            this.playCurrentPointSound();
        } else {
            // At the lowest Z segment - play boundary sound
            this.playBoundarySound();
        }
    }

    // Navigation methods for X segments
    moveToNextXSegment() {
        if (this.currentXSegment < this.xSegments.length - 1) {
            this.currentXSegment++;
            this.resetPositionInSegment('x');
            this.updateNavigationInfo();
            
            // Force buffer recreation to update segment highlighting
            if (this.engine) {
                this.engine.createBuffers();
            }
            
            this.playCurrentPointSound();
        } else {
            // At the highest X segment - play boundary sound
            this.playBoundarySound();
        }
    }

    moveToPreviousXSegment() {
        if (this.currentXSegment > 0) {
            this.currentXSegment--;
            this.resetPositionInSegment('x');
            this.updateNavigationInfo();
            
            // Force buffer recreation to update segment highlighting
            if (this.engine) {
                this.engine.createBuffers();
            }
            
            this.playCurrentPointSound();
        } else {
            // At the lowest X segment - play boundary sound
            this.playBoundarySound();
        }
    }

    // Navigation methods for X coordinate (left/right) - updated to use current segment
    moveXForward() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.grid.xValues.length === 0) {
            this.playBoundarySound();
            return;
        }

        const originalXIndex = this.currentXIndex;
        const originalZIndex = this.currentZIndex;
        let moved = false;
        let gapsJumped = 0;

        const coordName = this.navigationAxis === 'z' ? 'Y' : 'Z';
        console.log(`[DEBUG] Starting X forward movement from position (X:${originalXIndex}, ${coordName}:${originalZIndex})`);

        // Try to move to next X position, allowing jumps over gaps
        for (let newXIndex = this.currentXIndex + 1; newXIndex < segment.grid.xValues.length; newXIndex++) {
            // For each X position, try current coordinate first, then search all coordinate positions
            if (this.tryMoveToPosition(newXIndex, this.currentZIndex)) {
                moved = true;
                console.log(`[DEBUG] Found point at (X:${newXIndex}, ${coordName}:${this.currentZIndex}) - same ${coordName} level`);
                break;
            }
            
            // Count gaps we're jumping over
            gapsJumped++;
            
            // If no point at current coordinate, search all coordinate positions at this X
            const coordinateArray = this.navigationAxis === 'z' ? segment.grid.yValues : segment.grid.zValues;
            for (let coordIndex = 0; coordIndex < coordinateArray.length; coordIndex++) {
                if (this.tryMoveToPosition(newXIndex, coordIndex)) {
                    moved = true;
                    console.log(`[DEBUG] Found point at (X:${newXIndex}, ${coordName}:${coordIndex}) after jumping ${gapsJumped} X gaps and changing ${coordName} level`);
                    break;
                }
            }
            
            if (moved) break;
        }

        if (moved) {
            console.log(`✅ Moved X: (${originalXIndex}, ${originalZIndex}) → (${this.currentXIndex}, ${this.currentZIndex})`);
            this.updateNavigationInfo();
            this.playCurrentPointSound();
        } else {
            console.log(`❌ X boundary reached - no more clusters to the right from position ${this.currentXIndex}`);
            this.playBoundarySound();
        }
    }

    moveXBackward() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.grid.xValues.length === 0) {
            this.playBoundarySound();
            return;
        }

        const originalXIndex = this.currentXIndex;
        const originalZIndex = this.currentZIndex;
        let moved = false;
        let gapsJumped = 0;

        const coordName = this.navigationAxis === 'z' ? 'Y' : 'Z';
        console.log(`[DEBUG] Starting X backward movement from position (X:${originalXIndex}, ${coordName}:${originalZIndex})`);

        // Try to move to previous X position, allowing jumps over gaps
        for (let newXIndex = this.currentXIndex - 1; newXIndex >= 0; newXIndex--) {
            // For each X position, try current coordinate first, then search all coordinate positions
            if (this.tryMoveToPosition(newXIndex, this.currentZIndex)) {
                moved = true;
                console.log(`[DEBUG] Found point at (X:${newXIndex}, ${coordName}:${this.currentZIndex}) - same ${coordName} level`);
                break;
            }
            
            // Count gaps we're jumping over
            gapsJumped++;
            
            // If no point at current coordinate, search all coordinate positions at this X
            const coordinateArray = this.navigationAxis === 'z' ? segment.grid.yValues : segment.grid.zValues;
            for (let coordIndex = 0; coordIndex < coordinateArray.length; coordIndex++) {
                if (this.tryMoveToPosition(newXIndex, coordIndex)) {
                    moved = true;
                    console.log(`[DEBUG] Found point at (X:${newXIndex}, ${coordName}:${coordIndex}) after jumping ${gapsJumped} X gaps and changing ${coordName} level`);
                    break;
                }
            }
            
            if (moved) break;
        }

        if (moved) {
            console.log(`✅ Moved X: (${originalXIndex}, ${originalZIndex}) → (${this.currentXIndex}, ${this.currentZIndex})`);
            this.updateNavigationInfo();
            this.playCurrentPointSound();
        } else {
            console.log(`❌ X boundary reached - no more clusters to the left from position ${this.currentXIndex}`);
            this.playBoundarySound();
        }
    }

    // Navigation methods for secondary coordinate (up/down) - navigate to next point in up/down direction within segment
    moveZForward() {
        const segment = this.getCurrentSegment();
        const coordName = this.navigationAxis === 'z' ? 'Y' : 'Z';
        
        if (!segment || !segment.grid || segment.points.length === 0) {
            this.playBoundarySound();
            return;
        }

        const currentPoint = this.getCurrentPoint();
        if (!currentPoint) {
            this.playBoundarySound();
            return;
        }

        // Find the next point in the up direction (higher Y/Z value) within the current segment
        const targetCoord = this.navigationAxis === 'z' ? currentPoint.y : currentPoint.z;
        let bestPoint = null;
        let bestDistance = Infinity;

        // Search all points in the current segment for the next higher coordinate value
        for (const point of segment.points) {
            const pointCoord = this.navigationAxis === 'z' ? point.y : point.z;
            
            // Only consider points with higher coordinate values (moving up)
            if (pointCoord > targetCoord) {
                // Find the point with the smallest coordinate increase and closest X position
                const coordDistance = pointCoord - targetCoord;
                const xDistance = Math.abs(point.x - currentPoint.x);
                
                // Prioritize smaller coordinate jumps, then closer X positions
                const totalDistance = coordDistance * 1000 + xDistance; // Weight coordinate distance heavily
                
                if (totalDistance < bestDistance) {
                    bestDistance = totalDistance;
                    bestPoint = point;
                }
            }
        }

        if (bestPoint) {
            // Find the grid indices for the best point
            const xIndex = segment.grid.xValues.findIndex(x => Math.abs(x - bestPoint.x) < 0.0001);
            const coordIndex = this.navigationAxis === 'z' 
                ? segment.grid.yValues.findIndex(y => Math.abs(y - bestPoint.y) < 0.0001)
                : segment.grid.zValues.findIndex(z => Math.abs(z - bestPoint.z) < 0.0001);
            
            if (xIndex !== -1 && coordIndex !== -1 && this.tryMoveToPosition(xIndex, coordIndex)) {
                const oldCoord = targetCoord;
                const newCoord = this.navigationAxis === 'z' ? bestPoint.y : bestPoint.z;
                console.log(`✅ Moved ${coordName} up: ${oldCoord.toFixed(3)} → ${newCoord.toFixed(3)} (X: ${currentPoint.x.toFixed(2)} → ${bestPoint.x.toFixed(2)})`);
                this.updateNavigationInfo();
                this.playCurrentPointSound();
            } else {
                console.log(`❌ Failed to move to found point`);
                this.playBoundarySound();
            }
        } else {
            console.log(`❌ No higher ${coordName} values available in current segment`);
            this.playBoundarySound();
        }
    }

    moveZBackward() {
        const segment = this.getCurrentSegment();
        const coordName = this.navigationAxis === 'z' ? 'Y' : 'Z';
        
        if (!segment || !segment.grid || segment.points.length === 0) {
            this.playBoundarySound();
            return;
        }

        const currentPoint = this.getCurrentPoint();
        if (!currentPoint) {
            this.playBoundarySound();
            return;
        }

        // Find the next point in the down direction (lower Y/Z value) within the current segment
        const targetCoord = this.navigationAxis === 'z' ? currentPoint.y : currentPoint.z;
        let bestPoint = null;
        let bestDistance = Infinity;

        // Search all points in the current segment for the next lower coordinate value
        for (const point of segment.points) {
            const pointCoord = this.navigationAxis === 'z' ? point.y : point.z;
            
            // Only consider points with lower coordinate values (moving down)
            if (pointCoord < targetCoord) {
                // Find the point with the smallest coordinate decrease and closest X position
                const coordDistance = targetCoord - pointCoord;
                const xDistance = Math.abs(point.x - currentPoint.x);
                
                // Prioritize smaller coordinate jumps, then closer X positions
                const totalDistance = coordDistance * 1000 + xDistance; // Weight coordinate distance heavily
                
                if (totalDistance < bestDistance) {
                    bestDistance = totalDistance;
                    bestPoint = point;
                }
            }
        }

        if (bestPoint) {
            // Find the grid indices for the best point
            const xIndex = segment.grid.xValues.findIndex(x => Math.abs(x - bestPoint.x) < 0.0001);
            const coordIndex = this.navigationAxis === 'z' 
                ? segment.grid.yValues.findIndex(y => Math.abs(y - bestPoint.y) < 0.0001)
                : segment.grid.zValues.findIndex(z => Math.abs(z - bestPoint.z) < 0.0001);
            
            if (xIndex !== -1 && coordIndex !== -1 && this.tryMoveToPosition(xIndex, coordIndex)) {
                const oldCoord = targetCoord;
                const newCoord = this.navigationAxis === 'z' ? bestPoint.y : bestPoint.z;
                console.log(`✅ Moved ${coordName} down: ${oldCoord.toFixed(3)} → ${newCoord.toFixed(3)} (X: ${currentPoint.x.toFixed(2)} → ${bestPoint.x.toFixed(2)})`);
                this.updateNavigationInfo();
                this.playCurrentPointSound();
            } else {
                console.log(`❌ Failed to move to found point`);
                this.playBoundarySound();
            }
        } else {
            console.log(`❌ No lower ${coordName} values available in current segment`);
            this.playBoundarySound();
        }
    }

    // Navigation methods for Z coordinate movement in X navigation mode
    moveZForwardInXMode() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.grid.zValues.length === 0) {
            this.playBoundarySound();
            return;
        }

        const originalZIndex = this.currentZIndex;
        let moved = false;

        console.log(`[DEBUG] Starting Z forward movement in X mode from Z index ${originalZIndex}`);

        // Try to move to next Z position (higher Z values - positive direction)
        for (let newZIndex = this.currentZIndex + 1; newZIndex < segment.grid.zValues.length; newZIndex++) {
            if (this.tryMoveToPosition(0, newZIndex)) { // X navigation only uses zIndex
                moved = true;
                console.log(`[DEBUG] Found point at Z index ${newZIndex}`);
                break;
            }
        }

        if (moved) {
            console.log(`✅ Moved Z forward: index ${originalZIndex} → ${this.currentZIndex} (Z: ${segment.grid.zValues[originalZIndex]?.toFixed(3)} → ${segment.grid.zValues[this.currentZIndex]?.toFixed(3)})`);
            this.updateNavigationInfo();
            this.playCurrentPointSound();
        } else {
            console.log(`❌ Z boundary reached - no more points with higher Z values from index ${this.currentZIndex}`);
            this.playBoundarySound();
        }
    }

    moveZBackwardInXMode() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.grid.zValues.length === 0) {
            this.playBoundarySound();
            return;
        }

        const originalZIndex = this.currentZIndex;
        let moved = false;

        console.log(`[DEBUG] Starting Z backward movement in X mode from Z index ${originalZIndex}`);

        // Try to move to previous Z position (lower Z values - negative direction)
        for (let newZIndex = this.currentZIndex - 1; newZIndex >= 0; newZIndex--) {
            if (this.tryMoveToPosition(0, newZIndex)) { // X navigation only uses zIndex
                moved = true;
                console.log(`[DEBUG] Found point at Z index ${newZIndex}`);
                break;
            }
        }

        if (moved) {
            console.log(`✅ Moved Z backward: index ${originalZIndex} → ${this.currentZIndex} (Z: ${segment.grid.zValues[originalZIndex]?.toFixed(3)} → ${segment.grid.zValues[this.currentZIndex]?.toFixed(3)})`);
            this.updateNavigationInfo();
            this.playCurrentPointSound();
        } else {
            console.log(`❌ Z boundary reached - no more points with lower Z values from index ${this.currentZIndex}`);
            this.playBoundarySound();
        }
    }

    // Navigation methods for Y coordinate movement in X and Z navigation modes
    // Up/down should work when Y values differ but X and Z values are the same
    moveYForwardInXMode() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.points.length === 0) {
            this.playBoundarySound();
            return;
        }

        const currentPoint = this.getCurrentPoint();
        if (!currentPoint) {
            this.playBoundarySound();
            return;
        }

        // Find the next point in the up direction (higher Y value) with same X and Z
        const currentX = currentPoint.x;
        const currentZ = currentPoint.z;
        const currentY = currentPoint.y;
        
        let bestPoint = null;
        let bestDistance = Infinity;

        // Search all points in the current segment for the next higher Y value with same X and Z
        for (const point of segment.points) {
            // Check if X and Z are the same (within tolerance)
            const isXSame = Math.abs(point.x - currentX) < 0.0001;
            const isZSame = Math.abs(point.z - currentZ) < 0.0001;
            
            if (isXSame && isZSame && point.y > currentY) {
                // Found a point with same X,Z but higher Y
                const yDistance = point.y - currentY;
                if (yDistance < bestDistance) {
                    bestDistance = yDistance;
                    bestPoint = point;
                }
            }
        }

        if (bestPoint) {
            // Find the grid indices for the best point (X navigation uses only Z coordinate)
            const zIndex = segment.grid.zValues.findIndex(z => Math.abs(z - bestPoint.z) < 0.0001);
            
            if (zIndex !== -1 && this.tryMoveToPosition(0, zIndex)) {
                AccessibilityLogger.debug(`✅ Moved Y up in X mode: ${currentY.toFixed(3)} → ${bestPoint.y.toFixed(3)} (same X,Z: ${currentX.toFixed(2)}, ${currentZ.toFixed(2)})`);
                this.updateNavigationInfo();
                this.playCurrentPointSound();
            } else {
                AccessibilityLogger.debug(`❌ Failed to move to found point in X mode`);
                this.playBoundarySound();
            }
        } else {
            // Check if there are points with different X or Z values and higher Y
            let hasPointsWithDifferentXZAndHigherY = false;
            for (const point of segment.points) {
                if (point.y > currentY && 
                    (Math.abs(point.x - currentX) >= 0.0001 || Math.abs(point.z - currentZ) >= 0.0001)) {
                    hasPointsWithDifferentXZAndHigherY = true;
                    break;
                }
            }

            if (hasPointsWithDifferentXZAndHigherY) {
                AccessibilityLogger.debug(`❌ Cannot move Y up in X mode: Y values differ but X or Z also differ`);
            } else {
                AccessibilityLogger.debug(`❌ No higher Y values available with same X,Z in current X segment`);
            }
            this.playBoundarySound();
        }
    }

    moveYBackwardInXMode() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.points.length === 0) {
            this.playBoundarySound();
            return;
        }

        const currentPoint = this.getCurrentPoint();
        if (!currentPoint) {
            this.playBoundarySound();
            return;
        }

        // Find the next point in the down direction (lower Y value) with same X and Z
        const currentX = currentPoint.x;
        const currentZ = currentPoint.z;
        const currentY = currentPoint.y;
        
        let bestPoint = null;
        let bestDistance = Infinity;

        // Search all points in the current segment for the next lower Y value with same X and Z
        for (const point of segment.points) {
            // Check if X and Z are the same (within tolerance)
            const isXSame = Math.abs(point.x - currentX) < 0.0001;
            const isZSame = Math.abs(point.z - currentZ) < 0.0001;
            
            if (isXSame && isZSame && point.y < currentY) {
                // Found a point with same X,Z but lower Y
                const yDistance = currentY - point.y;
                if (yDistance < bestDistance) {
                    bestDistance = yDistance;
                    bestPoint = point;
                }
            }
        }

        if (bestPoint) {
            // Find the grid indices for the best point (X navigation uses only Z coordinate)
            const zIndex = segment.grid.zValues.findIndex(z => Math.abs(z - bestPoint.z) < 0.0001);
            
            if (zIndex !== -1 && this.tryMoveToPosition(0, zIndex)) {
                AccessibilityLogger.debug(`✅ Moved Y down in X mode: ${currentY.toFixed(3)} → ${bestPoint.y.toFixed(3)} (same X,Z: ${currentX.toFixed(2)}, ${currentZ.toFixed(2)})`);
                this.updateNavigationInfo();
                this.playCurrentPointSound();
            } else {
                AccessibilityLogger.debug(`❌ Failed to move to found point in X mode`);
                this.playBoundarySound();
            }
        } else {
            // Check if there are points with different X or Z values and lower Y
            let hasPointsWithDifferentXZAndLowerY = false;
            for (const point of segment.points) {
                if (point.y < currentY && 
                    (Math.abs(point.x - currentX) >= 0.0001 || Math.abs(point.z - currentZ) >= 0.0001)) {
                    hasPointsWithDifferentXZAndLowerY = true;
                    break;
                }
            }

            if (hasPointsWithDifferentXZAndLowerY) {
                AccessibilityLogger.debug(`❌ Cannot move Y down in X mode: Y values differ but X or Z also differ`);
            } else {
                AccessibilityLogger.debug(`❌ No lower Y values available with same X,Z in current X segment`);
            }
            this.playBoundarySound();
        }
    }

    moveYForwardInZMode() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.points.length === 0) {
            this.playBoundarySound();
            return;
        }

        const currentPoint = this.getCurrentPoint();
        if (!currentPoint) {
            this.playBoundarySound();
            return;
        }

        // Find the next point in the up direction (higher Y value) with same X and Z
        const currentX = currentPoint.x;
        const currentZ = currentPoint.z;
        const currentY = currentPoint.y;
        
        let bestPoint = null;
        let bestDistance = Infinity;

        // Search all points in the current segment for the next higher Y value with same X and Z
        for (const point of segment.points) {
            // Check if X and Z are the same (within tolerance)
            const isXSame = Math.abs(point.x - currentX) < 0.0001;
            const isZSame = Math.abs(point.z - currentZ) < 0.0001;
            
            if (isXSame && isZSame && point.y > currentY) {
                // Found a point with same X,Z but higher Y
                const yDistance = point.y - currentY;
                if (yDistance < bestDistance) {
                    bestDistance = yDistance;
                    bestPoint = point;
                }
            }
        }

        if (bestPoint) {
            // Find the grid indices for the best point (Z navigation uses X and Y coordinates)
            const xIndex = segment.grid.xValues.findIndex(x => Math.abs(x - bestPoint.x) < 0.0001);
            const yIndex = segment.grid.yValues.findIndex(y => Math.abs(y - bestPoint.y) < 0.0001);
            
            if (xIndex !== -1 && yIndex !== -1 && this.tryMoveToPosition(xIndex, yIndex)) {
                AccessibilityLogger.debug(`✅ Moved Y up in Z mode: ${currentY.toFixed(3)} → ${bestPoint.y.toFixed(3)} (same X,Z: ${currentX.toFixed(2)}, ${currentZ.toFixed(2)})`);
                this.updateNavigationInfo();
                this.playCurrentPointSound();
            } else {
                AccessibilityLogger.debug(`❌ Failed to move to found point in Z mode`);
                this.playBoundarySound();
            }
        } else {
            // Check if there are points with different X or Z values and higher Y
            let hasPointsWithDifferentXZAndHigherY = false;
            for (const point of segment.points) {
                if (point.y > currentY && 
                    (Math.abs(point.x - currentX) >= 0.0001 || Math.abs(point.z - currentZ) >= 0.0001)) {
                    hasPointsWithDifferentXZAndHigherY = true;
                    break;
                }
            }

            if (hasPointsWithDifferentXZAndHigherY) {
                AccessibilityLogger.debug(`❌ Cannot move Y up in Z mode: Y values differ but X or Z also differ`);
            } else {
                AccessibilityLogger.debug(`❌ No higher Y values available with same X,Z in current Z segment`);
            }
            this.playBoundarySound();
        }
    }

    moveYBackwardInZMode() {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid || segment.points.length === 0) {
            this.playBoundarySound();
            return;
        }

        const currentPoint = this.getCurrentPoint();
        if (!currentPoint) {
            this.playBoundarySound();
            return;
        }

        // Find the next point in the down direction (lower Y value) with same X and Z
        const currentX = currentPoint.x;
        const currentZ = currentPoint.z;
        const currentY = currentPoint.y;
        
        let bestPoint = null;
        let bestDistance = Infinity;

        // Search all points in the current segment for the next lower Y value with same X and Z
        for (const point of segment.points) {
            // Check if X and Z are the same (within tolerance)
            const isXSame = Math.abs(point.x - currentX) < 0.0001;
            const isZSame = Math.abs(point.z - currentZ) < 0.0001;
            
            if (isXSame && isZSame && point.y < currentY) {
                // Found a point with same X,Z but lower Y
                const yDistance = currentY - point.y;
                if (yDistance < bestDistance) {
                    bestDistance = yDistance;
                    bestPoint = point;
                }
            }
        }

        if (bestPoint) {
            // Find the grid indices for the best point (Z navigation uses X and Y coordinates)
            const xIndex = segment.grid.xValues.findIndex(x => Math.abs(x - bestPoint.x) < 0.0001);
            const yIndex = segment.grid.yValues.findIndex(y => Math.abs(y - bestPoint.y) < 0.0001);
            
            if (xIndex !== -1 && yIndex !== -1 && this.tryMoveToPosition(xIndex, yIndex)) {
                AccessibilityLogger.debug(`✅ Moved Y down in Z mode: ${currentY.toFixed(3)} → ${bestPoint.y.toFixed(3)} (same X,Z: ${currentX.toFixed(2)}, ${currentZ.toFixed(2)})`);
                this.updateNavigationInfo();
                this.playCurrentPointSound();
            } else {
                AccessibilityLogger.debug(`❌ Failed to move to found point in Z mode`);
                this.playBoundarySound();
            }
        } else {
            // Check if there are points with different X or Z values and lower Y
            let hasPointsWithDifferentXZAndLowerY = false;
            for (const point of segment.points) {
                if (point.y < currentY && 
                    (Math.abs(point.x - currentX) >= 0.0001 || Math.abs(point.z - currentZ) >= 0.0001)) {
                    hasPointsWithDifferentXZAndLowerY = true;
                    break;
                }
            }

            if (hasPointsWithDifferentXZAndLowerY) {
                AccessibilityLogger.debug(`❌ Cannot move Y down in Z mode: Y values differ but X or Z also differ`);
            } else {
                AccessibilityLogger.debug(`❌ No lower Y values available with same X,Z in current Z segment`);
            }
            this.playBoundarySound();
        }
    }

    // Helper method to try moving to a specific grid position - updated to use current segment
    tryMoveToPosition(xIndex, zIndex) {
        const segment = this.getCurrentSegment();
        if (!segment || !segment.grid) return false;

        const grid = segment.grid;
        
        if (this.navigationAxis === 'z') {
            // Z navigation: xIndex is X coordinate, zIndex is Y coordinate
            if (xIndex < 0 || xIndex >= grid.xValues.length || 
                zIndex < 0 || zIndex >= grid.yValues.length) {
                return false;
            }

            // Check if there's a point at this X,Y position (within the same Z plane)
            const x = grid.xValues[xIndex];
            const y = grid.yValues[zIndex]; // zIndex maps to Y coordinate in Z navigation
            const key = `${x},${y}`;
            
            if (grid.pointMap.has(key)) {
                this.currentXIndex = xIndex;
                this.currentZIndex = zIndex;
                return true;
            }
        } else if (this.navigationAxis === 'x') {
            // X navigation: only zIndex is used for Z coordinate navigation
            if (zIndex < 0 || zIndex >= grid.zValues.length) {
                return false;
            }

            // Check if there's a point at this Z position (within the same X plane)
            const z = grid.zValues[zIndex]; // zIndex maps to Z coordinate in X navigation
            const key = `${z}`;
            
            if (grid.pointMap.has(key)) {
                this.currentXIndex = 0; // X navigation doesn't use currentXIndex for positioning
                this.currentZIndex = zIndex;
                return true;
            }
        } else {
            // Y navigation: xIndex is X coordinate, zIndex is Z coordinate
            if (xIndex < 0 || xIndex >= grid.xValues.length || 
                zIndex < 0 || zIndex >= grid.zValues.length) {
                return false;
            }

            // Check if there's a point at this X,Z position (within the same Y range)
            const x = grid.xValues[xIndex];
            const z = grid.zValues[zIndex];
            const key = `${x},${z}`;
            
            if (grid.pointMap.has(key)) {
                this.currentXIndex = xIndex;
                this.currentZIndex = zIndex;
                return true;
            }
        }
        
        return false;
    }

    // Helper method to play sound for current point during navigation
    playCurrentPointSound() {
        const currentPoint = this.getCurrentPoint();
        if (this.sonificationController && currentPoint) {
            this.sonificationController.sonifyPointByYValue(currentPoint);
        }
        // For automatic navigation, only announce to screen readers if text mode is active
        if (this.textController && currentPoint && this.textController.displayMode !== 'off') {
            // Use assertive to interrupt previous announcements during navigation
            const message = this.textController.getPointMessage(currentPoint);
            if (message) {
                this.textController.announceToScreenReader(message, true);
            }
        }
    }

    // Helper method to play boundary sound
    playBoundarySound() {
        if (this.sonificationController) {
            this.sonificationController.playBoundarySound();
        }
    }

    // Helper method to find a valid point at current 2D coordinates (simplified)
    findValidPoint() {
        // This method is now simplified since the movement methods handle validation
        const currentPoint = this.getCurrentPoint();
        if (!currentPoint) {
            // If we somehow got to an invalid position, reset to a valid one
            this.resetPositionInSegment();
        }
    }

    /**
     * === WIREFRAME NAVIGATION METHODS ===
     * These methods handle navigation within wireframe rectangles independently from point navigation
     */

    /**
     * Check if we're currently in wireframe mode
     * @returns {boolean} - True if wireframe mode is active
     */
    isWireframeMode() {
        const displayMode = document.getElementById('displayMode')?.value;
        return displayMode === 'surface';
    }

    /**
     * Initialize wireframe navigation when switching to wireframe mode
     */
    initializeWireframeNavigation() {
        if (!this.isWireframeMode()) {
            this.wireframeNavigationMode = false;
            return;
        }

        // Get wireframe rectangles from the highlight controller
        this.wireframeRectangles = this.highlightController?.wireframeRectangles || [];
        this.wireframeNavigationMode = this.wireframeRectangles.length > 0;
        
        if (this.wireframeNavigationMode) {
            // Create 2D grid for spatial wireframe navigation
            this.createWireframeGrid();
            this.currentWireframeRectIndex = 0;
            this.currentWireframeXIndex = 0;
            this.currentWireframeZIndex = 0;
        }

        console.log(`[DEBUG] NavigationController: Initialized wireframe navigation with ${this.wireframeRectangles.length} rectangles`);

        if (this.wireframeNavigationMode && this.isActive) {
            this.updateWireframeHighlight();
        }
    }

    /**
     * Create 2D grid for wireframe spatial navigation
     */
    createWireframeGrid() {
        if (this.wireframeRectangles.length === 0) {
            this.wireframeGrid = { xValues: [], zValues: [], rectMap: new Map() };
            return;
        }

        // Get unique X and Z values from rectangle centers, sorted
        const xValues = [...new Set(this.wireframeRectangles.map(rect => rect.center.x))].sort((a, b) => a - b);
        const zValues = [...new Set(this.wireframeRectangles.map(rect => rect.center.z))].sort((a, b) => a - b);

        // Create a map for quick rectangle lookup: "x,z" -> rectangle index
        const rectMap = new Map();
        this.wireframeRectangles.forEach((rect, index) => {
            // Find closest grid positions for this rectangle
            const closestX = xValues.reduce((prev, curr) => 
                Math.abs(curr - rect.center.x) < Math.abs(prev - rect.center.x) ? curr : prev
            );
            const closestZ = zValues.reduce((prev, curr) => 
                Math.abs(curr - rect.center.z) < Math.abs(prev - rect.center.z) ? curr : prev
            );
            
            const key = `${closestX},${closestZ}`;
            rectMap.set(key, index);
        });

        this.wireframeGrid = {
            xValues,
            zValues,
            rectMap
        };

        console.log(`[DEBUG] Wireframe grid created: ${xValues.length} X values × ${zValues.length} Z values`);
    }

    /**
     * Get current wireframe rectangle using 2D grid coordinates
     */
    getCurrentWireframeRectangleFromGrid() {
        if (!this.wireframeGrid || 
            this.currentWireframeXIndex < 0 || this.currentWireframeXIndex >= this.wireframeGrid.xValues.length ||
            this.currentWireframeZIndex < 0 || this.currentWireframeZIndex >= this.wireframeGrid.zValues.length) {
            return null;
        }
        
        const x = this.wireframeGrid.xValues[this.currentWireframeXIndex];
        const z = this.wireframeGrid.zValues[this.currentWireframeZIndex];
        const key = `${x},${z}`;
        
        const rectIndex = this.wireframeGrid.rectMap.get(key);
        if (rectIndex !== undefined) {
            this.currentWireframeRectIndex = rectIndex;
            return this.wireframeRectangles[rectIndex];
        }
        
        return null;
    }

    /**
     * Update wireframe highlight based on current navigation state
     */
    updateWireframeHighlight() {
        if (!this.highlightController || !this.wireframeNavigationMode) {
            return;
        }

        if (this.isActive && this.isWireframeMode()) {
            // Enable wireframe highlighting
            this.highlightController.setWireframeHighlightEnabled(true);
            
            if (this.wireframeRectangles.length > 0) {
                this.highlightController.setHighlightedWireframeRectangle(this.currentWireframeRectIndex);
            }
        } else {
            // Disable wireframe highlighting
            this.highlightController.setWireframeHighlightEnabled(false);
        }
    }

    /**
     * Move to the next wireframe rectangle
     */
    moveToNextWireframeRectangle() {
        if (!this.wireframeNavigationMode || this.wireframeRectangles.length === 0) {
            return;
        }

        this.currentWireframeRectIndex = (this.currentWireframeRectIndex + 1) % this.wireframeRectangles.length;
        this.updateWireframeHighlight();
        this.updateWireframeNavigationInfo();
        
        // Play audio feedback for wireframe navigation
        this.playWireframeNavigationSound();
    }

    /**
     * Move to the previous wireframe rectangle
     */
    moveToPreviousWireframeRectangle() {
        if (!this.wireframeNavigationMode || this.wireframeRectangles.length === 0) {
            return;
        }

        this.currentWireframeRectIndex = (this.currentWireframeRectIndex - 1 + this.wireframeRectangles.length) % this.wireframeRectangles.length;
        this.updateWireframeHighlight();
        this.updateWireframeNavigationInfo();
        
        // Play audio feedback for wireframe navigation
        this.playWireframeNavigationSound();
    }

    /**
     * Move right along X axis in wireframe grid
     */
    moveWireframeXForward() {
        if (!this.wireframeNavigationMode || !this.wireframeGrid) {
            return;
        }

        const newXIndex = Math.min(this.currentWireframeXIndex + 1, this.wireframeGrid.xValues.length - 1);
        if (newXIndex !== this.currentWireframeXIndex) {
            this.currentWireframeXIndex = newXIndex;
            this.updateWireframePositionFromGrid();
        } else {
            // Hit boundary - play boundary sound
            this.playBoundarySound();
        }
    }

    /**
     * Move left along X axis in wireframe grid
     */
    moveWireframeXBackward() {
        if (!this.wireframeNavigationMode || !this.wireframeGrid) {
            return;
        }

        const newXIndex = Math.max(this.currentWireframeXIndex - 1, 0);
        if (newXIndex !== this.currentWireframeXIndex) {
            this.currentWireframeXIndex = newXIndex;
            this.updateWireframePositionFromGrid();
        } else {
            // Hit boundary - play boundary sound
            this.playBoundarySound();
        }
    }

    /**
     * Move forward along Z axis in wireframe grid
     */
    moveWireframeZForward() {
        if (!this.wireframeNavigationMode || !this.wireframeGrid) {
            return;
        }

        const newZIndex = Math.min(this.currentWireframeZIndex + 1, this.wireframeGrid.zValues.length - 1);
        if (newZIndex !== this.currentWireframeZIndex) {
            this.currentWireframeZIndex = newZIndex;
            this.updateWireframePositionFromGrid();
        } else {
            // Hit boundary - play boundary sound
            this.playBoundarySound();
        }
    }

    /**
     * Move backward along Z axis in wireframe grid
     */
    moveWireframeZBackward() {
        if (!this.wireframeNavigationMode || !this.wireframeGrid) {
            return;
        }

        const newZIndex = Math.max(this.currentWireframeZIndex - 1, 0);
        if (newZIndex !== this.currentWireframeZIndex) {
            this.currentWireframeZIndex = newZIndex;
            this.updateWireframePositionFromGrid();
        } else {
            // Hit boundary - play boundary sound
            this.playBoundarySound();
        }
    }

    /**
     * Update wireframe position and highlighting after grid movement
     */
    updateWireframePositionFromGrid() {
        const rect = this.getCurrentWireframeRectangleFromGrid();
        if (rect) {
            this.updateWireframeHighlight();
            this.updateWireframeNavigationInfo();
            this.playWireframeNavigationSound();
        }
    }

    /**
     * Get current wireframe rectangle data
     * @returns {Object|null} - Current wireframe rectangle or null
     */
    getCurrentWireframeRectangle() {
        // Use grid-based navigation if available, fallback to index-based
        if (this.wireframeGrid) {
            return this.getCurrentWireframeRectangleFromGrid();
        }
        
        if (!this.wireframeNavigationMode || 
            this.currentWireframeRectIndex < 0 || 
            this.currentWireframeRectIndex >= this.wireframeRectangles.length) {
            return null;
        }
        
        return this.wireframeRectangles[this.currentWireframeRectIndex];
    }

    /**
     * Get the total number of wireframe rectangles available for navigation
     * @returns {number} - Total count of wireframe rectangles
     */
    getWireframeRectangleCount() {
        return this.wireframeRectangles.length;
    }

    /**
     * Update wireframe navigation info for wireframe mode
     */
    updateWireframeNavigationInfo() {
        if (this.textController) {
            this.textController.updateWireframeNavigationInfo(this);
        }
    }

    /**
     * Play audio feedback for wireframe navigation
     */
    playWireframeNavigationSound() {
        AccessibilityLogger.debug('playWireframeNavigationSound called');
        AccessibilityLogger.debug('Sonification controller exists:', !!this.sonificationController);
        AccessibilityLogger.debug('Sonification enabled:', this.sonificationController?.isEnabled);
        AccessibilityLogger.debug('Audio context exists:', !!this.sonificationController?.audioContext);
        
        if (this.sonificationController && this.sonificationController.isEnabled) {
            const currentRect = this.getCurrentWireframeRectangleFromGrid();
            AccessibilityLogger.debug('Current wireframe rectangle:', currentRect);
            
            if (currentRect) {
                AccessibilityLogger.debug('Playing wireframe sound for Y value:', currentRect.avgY);
                // Use the rectangle's average Y value for sonification
                this.sonificationController.playDataSonification(currentRect.avgY, 0.3, 150);
            } else {
                AccessibilityLogger.debug('No current rectangle found for wireframe sound');
            }
        } else {
            AccessibilityLogger.debug('Wireframe sound not played - sonification controller not available or disabled');
        }
        
        // For automatic wireframe navigation, only announce to screen readers if text mode is active
        const currentRect = this.getCurrentWireframeRectangleFromGrid();
        if (this.textController && currentRect && this.textController.displayMode !== 'off') {
            // Use assertive to interrupt previous announcements during navigation
            const message = this.textController.getWireframeRectangleMessage(currentRect);
            if (message) {
                this.textController.announceToScreenReader(message, true);
            }
        }
    }

    /**
     * Announce axis label based on key pressed (x, y, z)
     * @param {string} axis - The axis key ('x', 'y', or 'z')
     */
    announceAxisLabel(axis) {
        // Input validation as required by architecture rules
        if (!axis || typeof axis !== 'string') {
            AccessibilityLogger.error('Invalid axis parameter - must be a non-empty string');
            return;
        }
        
        const normalizedAxis = axis.toLowerCase().trim();
        if (!['x', 'y', 'z'].includes(normalizedAxis)) {
            AccessibilityLogger.error(`Invalid axis for label announcement: '${axis}'. Must be 'x', 'y', or 'z'`);
            return;
        }

        if (!this.data || !this.textController) {
            AccessibilityLogger.warn('Cannot announce axis label - missing dependencies');
            return;
        }

        let label, unit, message;
        
        switch (normalizedAxis) {
            case 'x':
                label = this.data.xLabel || 'X';
                unit = this.data.xUnit || '';
                message = unit ? `X axis: ${label} in ${unit}` : `X axis: ${label}`;
                break;
            case 'y':
                label = this.data.yLabel || 'Y';
                unit = this.data.yUnit || '';
                message = unit ? `Y axis: ${label} in ${unit}` : `Y axis: ${label}`;
                break;
            case 'z':
                label = this.data.zLabel || 'Z';
                unit = this.data.zUnit || '';
                message = unit ? `Z axis: ${label} in ${unit}` : `Z axis: ${label}`;
                break;
        }

        // Always announce to screen reader (works with external screen readers like NVDA, JAWS, VoiceOver)
        this.textController.announceToScreenReader(message, true); // Assertive - interrupts other announcements
        
        // Also use built-in TTS to provide immediate audible feedback when the plot is active.
        // Use a "point announcement" flag so TTS will speak even if the global TTS toggle is off.
        // This ensures X/Y/Z keys produce an audible announcement for users who tab into the plot.
        if (this.ttsController) {
            this.textController.speak(message, true); // Force point announcement (plays regardless of TTS toggle)
        }

        AccessibilityLogger.info(`Announced ${normalizedAxis.toUpperCase()} axis label: ${message}`);
    }

    // Cleanup method
    destroy() {
        // Clean up review mode controller
        if (this.reviewModeController) {
            this.reviewModeController.destroy();
            this.reviewModeController = null;
        }

        // Remove canvas focus handling
        const canvas = document.getElementById('glCanvas');
        if (canvas) {
            canvas.removeEventListener('focus', this.handleCanvasFocus);
            canvas.removeEventListener('blur', this.handleCanvasBlur);
        }
        
        // Note: Keyboard event listener is automatically cleaned up via eventListeners tracking below
        
        // Clean up tracked event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
        
        // Clean up sub-controllers with dependency injection
        if (this.textController) {
            this.textController.destroy?.();
            this.textController = null;
        }
        
        if (this.sonificationController) {
            this.sonificationController.destroy?.();
            this.sonificationController = null;
        }
        
        if (this.highlightController) {
            this.highlightController.destroy?.();
            this.highlightController = null;
        }
        
        if (this.ttsController) {
            this.ttsController.destroy?.();
            this.ttsController = null;
        }
        
        if (this.gamepadController) {
            this.gamepadController.destroy?.();
            this.gamepadController = null;
        }
        
        if (this.autoPlayController) {
            this.autoPlayController.destroy();
            this.autoPlayController = null;
        }
        
        // Reset navigation state
        this.isActive = false;
        this.wireframeNavigationMode = false;
        
        AccessibilityLogger.info('NavigationController destroyed and cleaned up');
    }
}
