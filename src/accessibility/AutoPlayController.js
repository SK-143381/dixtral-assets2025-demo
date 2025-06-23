// Logger and EVENTS will be injected by NavigationController

export class AutoPlayController {
    constructor() {
        // Core autoplay properties
        this.autoplayActive = false;
        this.autoplayTimeouts = []; // Store timeout IDs for cleanup
        this.autoplayCurrentPointIndex = -1; // Track currently highlighted point during autoplay
        this.fastAutoplayMode = false; // Fast intelligent traverse mode
        this.autoplayMode = 'normal'; // 'normal' or 'fast'
        
        // Dependencies - injected by NavigationController
        this.audioContext = null;
        this.dataController = null;
        this.textController = null;
        this.highlightController = null;
        this.navigationController = null;
        this.sonificationController = null; // For isEnabled check
        this.logger = null; // Will be injected by NavigationController
        this.events = null; // Will be injected by NavigationController
        
        // Event listener tracking for cleanup
        this.eventListeners = new Map();
    }

    /**
     * Set dependencies via dependency injection (follows architectural rules)
     * @param {Object} dependencies - Object containing all required dependencies
     */
    setDependencies(dependencies) {
        this.audioContext = dependencies.audioContext;
        this.dataController = dependencies.dataController;
        this.textController = dependencies.textController;
        this.highlightController = dependencies.highlightController;
        this.navigationController = dependencies.navigationController;
        this.sonificationController = dependencies.sonificationController;
        this.logger = dependencies.logger;
        this.events = dependencies.events;
        
        this.logger?.debug('AutoPlayController dependencies injected');
    }

    /**
     * Initialize autoplay controller
     */
    async initialize() {
        this.logger?.debug('AutoPlayController initialized');
    }

    /**
     * Toggle autoplay functionality - called by NavigationController for P key
     */
    toggleAutoplay() {
        if (this.autoplayActive) {
            this.stopAutoplay();
        } else {
            this.startAutoplay();
        }
    }

    /**
     * Switch to fast intelligent autoplay mode - called by NavigationController for I key
     */
    switchToFastAutoplay() {
        if (!this.autoplayActive) {
            this.logger?.debug('Cannot switch to fast mode - autoplay not active');
            return;
        }

        if (this.autoplayMode === 'fast') {
            this.logger?.debug('Already in fast autoplay mode');
            return;
        }

        // Check display mode FIRST - don't interrupt point mode autoplay
        const displayMode = document.getElementById('displayMode')?.value || 'points';
        const isWireframeMode = displayMode === 'surface';
        
        if (!isWireframeMode) {
            // Point mode doesn't support intelligent fast autoplay - don't interrupt normal autoplay
            if (this.textController) {
                this.textController.announceToScreenReader('Intelligent fast autoplay is only available in surface display mode');
            }
            this.logger?.info('Fast autoplay not supported in point mode - switch to surface mode');
            return; // Exit without stopping current autoplay
        }

        // Stop current autoplay (only in surface mode)
        this.autoplayTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.autoplayTimeouts = [];

        // Switch to fast mode
        this.autoplayMode = 'fast';
        this.fastAutoplayMode = true;

        // Announce mode switch
        if (this.textController) {
            this.textController.announceToScreenReader('Switched to intelligent fast autoplay - adaptive timing slows down for significant peaks and troughs');
        }

        this.logger?.info('Switched to fast autoplay mode');

        // Start fast wireframe autoplay
        this.startFastWireframeAutoplay();
    }

    /**
     * Start autoplay functionality - "whole to part" strategy
     * Handles both point mode (traverses Z segments) and surface mode (traverses wireframe rectangles)
     */
    startAutoplay() {
        if (!this.audioContext || !this.sonificationController?.isEnabled || this.autoplayActive) {
            this.logger?.debug('Autoplay not started - audio context missing, disabled, or already active');
            return;
        }

        if (!this.dataController) {
            this.logger?.warn('Cannot start autoplay - no data controller available');
            return;
        }

        // Check if data is available
        const dataRange = this.dataController.getDataRange();
        if (!dataRange || !this.dataController.zValues || this.dataController.zValues.length === 0) {
            this.logger?.warn('Cannot start autoplay - no data available');
            if (this.textController) {
                this.textController.announceToScreenReader('No data available for autoplay');
            }
            return;
        }

        this.autoplayActive = true;
        this.autoplayTimeouts = [];

        // Determine display mode for different autoplay strategies
        const displayMode = document.getElementById('displayMode')?.value || 'points';
        const isWireframeMode = displayMode === 'surface';
        
        // Announce autoplay start with current display mode
        if (this.textController) {
            const modeText = isWireframeMode ? 'surface mode' : 'point mode';
            const strategyText = isWireframeMode ? 'left to right, row by row' : 'front to back';
            this.textController.announceToScreenReader(`Autoplay started in ${modeText} - data overview ${strategyText}`);
        }

        this.logger?.info(`Starting autoplay in ${isWireframeMode ? 'wireframe' : 'point'} mode`);

        // Dispatch state change event
        document.dispatchEvent(new CustomEvent(this.events.AUTOPLAY_STATE_CHANGED, {
            detail: { active: true, mode: isWireframeMode ? 'wireframe' : 'point' }
        }));

        if (isWireframeMode) {
            this.startWireframeAutoplay();
        } else {
            this.startPointAutoplay();
        }
    }

    /**
     * Start autoplay for point mode - original Z segment strategy
     */
    startPointAutoplay() {
        // Get Z segments organized by unique Z values (front to back)
        const zSegments = this.organizeZSegmentsForAutoplay();
        
        // Calculate timing parameters
        const pointsPerSecond = 8; // 8 points per second for good audibility
        const pointDuration = 1000 / pointsPerSecond; // 125ms per point
        const segmentPause = 300; // 300ms pause between segments
        
        let currentTime = 0;
        
        // Process each Z segment
        zSegments.forEach((segment, segmentIndex) => {
            // Sort points within segment by X coordinate (positive to negative)
            const sortedPoints = segment.points.sort((a, b) => b.x - a.x);
            
            // Add pause before segment (except first)
            if (segmentIndex > 0) {
                currentTime += segmentPause;
            }
            
            // Schedule each point in the segment
            sortedPoints.forEach((point, pointIndex) => {
                const timeoutId = setTimeout(() => {
                    if (this.autoplayActive) {
                        this.playAutoplayPoint(point, segmentIndex, pointIndex, zSegments.length, sortedPoints.length);
                    }
                }, currentTime);
                
                this.autoplayTimeouts.push(timeoutId);
                currentTime += pointDuration;
            });
        });
        
        // Schedule autoplay completion
        const completionTimeoutId = setTimeout(() => {
            this.stopAutoplay();
            if (this.textController) {
                this.textController.announceToScreenReader('Autoplay completed');
            }
            this.logger?.info('Autoplay completed');
        }, currentTime + 500);
        
        this.autoplayTimeouts.push(completionTimeoutId);
    }

    /**
     * Start autoplay for wireframe mode - row by row rectangle strategy
     */
    startWireframeAutoplay() {
        if (!this.navigationController?.wireframeGrid) {
            this.logger?.warn('Cannot start wireframe autoplay - wireframe grid not available');
            this.autoplayActive = false;
            return;
        }

        const wireframeGrid = this.navigationController.wireframeGrid;
        const xValues = wireframeGrid.xValues;
        const zValues = wireframeGrid.zValues;
        
        // Calculate timing parameters
        const rectanglesPerSecond = 4; // 4 rectangles per second
        const rectangleDuration = 250; // 250ms per rectangle
        const rowPause = 500; // 500ms pause between rows
        
        let currentTime = 0;
        
        // Traverse wireframe grid: left to right, then next row (top to bottom)
        for (let zIndex = 0; zIndex < zValues.length; zIndex++) {
            // Add pause before each row (except first)
            if (zIndex > 0) {
                currentTime += rowPause;
            }
            
            // Traverse each row from left to right
            for (let xIndex = 0; xIndex < xValues.length; xIndex++) {
                const x = xValues[xIndex];
                const z = zValues[zIndex];
                const key = `${x},${z}`;
                const rectIndex = wireframeGrid.rectMap.get(key);
                
                if (rectIndex !== undefined) {
                    // Schedule this rectangle
                    const timeoutId = setTimeout(() => {
                        if (this.autoplayActive) {
                            this.playAutoplayWireframeRectangle(rectIndex, xIndex, zIndex, xValues.length, zValues.length);
                        }
                    }, currentTime);
                    
                    this.autoplayTimeouts.push(timeoutId);
                    currentTime += rectangleDuration;
                }
            }
        }
        
        // Schedule autoplay completion
        const completionTimeoutId = setTimeout(() => {
            this.stopAutoplay();
            if (this.textController) {
                this.textController.announceToScreenReader('Autoplay completed');
            }
            this.logger?.info('Wireframe autoplay completed');
        }, currentTime + 500);
        
        this.autoplayTimeouts.push(completionTimeoutId);
    }

    /**
     * Stop autoplay functionality
     */
    stopAutoplay() {
        if (!this.autoplayActive) return;

        this.autoplayActive = false;
        
        // Clear all scheduled timeouts
        this.autoplayTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.autoplayTimeouts = [];
        
        // Clear visual highlighting when autoplay stops
        if (this.highlightController) {
            // Clear point highlighting
            if (this.autoplayCurrentPointIndex !== -1) {
                this.highlightController.clearHighlight();
                this.autoplayCurrentPointIndex = -1;
            }
            
            // Clear wireframe highlighting
            this.highlightController.clearWireframeHighlight();
            this.highlightController.setWireframeHighlightEnabled(false);
            this.logger?.debug('Autoplay wireframe highlighting cleared');
        }
        
        // Reset navigation info when autoplay stops to ensure clean UI state
        if (this.navigationController) {
            setTimeout(() => {
                if (this.navigationController.textController) {
                    this.navigationController.updateNavigationInfo();
                }
            }, 50);
        }
        
        // Reset autoplay mode
        this.autoplayMode = 'normal';
        this.fastAutoplayMode = false;
        
        this.logger?.info('Autoplay stopped');
        
        if (this.textController) {
            this.textController.announceToScreenReader('Autoplay stopped');
        }

        // Dispatch state change event
        document.dispatchEvent(new CustomEvent(this.events?.AUTOPLAY_STATE_CHANGED || 'autoplay-state-changed', {
            detail: { active: false, mode: null }
        }));
    }

    /**
     * Organize data points by unique Z values for autoplay traversal
     * @returns {Array} Array of segments with zValue and points
     */
    organizeZSegmentsForAutoplay() {
        const totalPoints = this.dataController.zValues.length;
        const allPoints = [];
        
        // Create array of all points
        for (let i = 0; i < totalPoints; i++) {
            allPoints.push({
                x: this.dataController.xValues[i],
                y: this.dataController.yValues[i],
                z: this.dataController.zValues[i],
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

        // Convert to array and sort by Z value (front to back - positive to negative)
        const uniqueZValues = Array.from(zGroupMap.keys()).sort((a, b) => b - a);
        
        return uniqueZValues.map(zValue => ({
            zValue: zValue,
            points: zGroupMap.get(zValue)
        }));
    }

    /**
     * Play a single point during autoplay with stereo positioning and visual highlighting
     */
    playAutoplayPoint(point, segmentIndex, pointIndex, totalSegments, totalPointsInSegment) {
        if (!this.audioContext || !point || !this.sonificationController?.isEnabled) return;

        // Visual highlighting: highlight the current point being played
        if (this.highlightController && point.index !== undefined) {
            // Clear any previous autoplay highlighting
            if (this.autoplayCurrentPointIndex !== -1) {
                this.highlightController.clearHighlight();
            }
            
            // Highlight the current point
            this.autoplayCurrentPointIndex = point.index;
            this.highlightController.setEnabled(true);
            this.highlightController.setHighlightedPoint(point.index);
            
            this.logger?.debug(`Autoplay highlighting point index ${point.index} - X:${point.x.toFixed(2)} Y:${point.y.toFixed(2)} Z:${point.z.toFixed(2)}`);
        }

        // Update segment highlighting: sync NavigationController's current segment with autoplay
        if (this.navigationController) {
            this.updateNavigationSegmentForAutoplay(point);
        }

        // Get data range for normalization
        const dataRange = this.dataController.getDataRange();
        
        // Normalize coordinates (0 to 1)
        const normalizedX = (point.x - dataRange.x.min) / (dataRange.x.max - dataRange.x.min);
        const normalizedY = (point.y - dataRange.y.min) / (dataRange.y.max - dataRange.y.min);
        const normalizedZ = (point.z - dataRange.z.min) / (dataRange.z.max - dataRange.z.min);
        
        // Create audio nodes with stereo positioning
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const pannerNode = this.audioContext.createStereoPanner();
        
        // Y value → Frequency (primary data mapping)
        const minFreq = 200;
        const maxFreq = 1200;
        const frequency = minFreq + normalizedY * (maxFreq - minFreq);
        
        // X value → Stereo panning (-1 = left, 1 = right)
        const panValue = (normalizedX * 2) - 1; // Convert 0-1 to -1 to 1
        
        // Z value → Volume and filtering (depth perception)
        // Front (high Z) = louder, Back (low Z) = quieter
        const baseVolume = 0.3 + normalizedZ * 0.4; // 0.3 to 0.7 range
        
        // Duration based on position in sequence (slightly longer for important points)
        const duration = 0.08 + (normalizedY * 0.04); // 80-120ms duration
        
        // Configure oscillator
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        
        // Configure stereo panning
        pannerNode.pan.setValueAtTime(panValue, this.audioContext.currentTime);
        
        // Configure volume envelope
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(baseVolume, this.audioContext.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
        
        // Connect audio nodes: oscillator → gain → panner → destination
        oscillator.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(this.audioContext.destination);
        
        // Play the sound
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
        
        this.logger?.debug(`Autoplay point - Z:${point.z.toFixed(2)} X:${point.x.toFixed(2)} Y:${point.y.toFixed(2)} → freq:${frequency.toFixed(0)}Hz, pan:${panValue.toFixed(2)}, vol:${baseVolume.toFixed(2)}`);
    }

    /**
     * Play a single wireframe rectangle during autoplay with visual highlighting
     */
    playAutoplayWireframeRectangle(rectIndex, xIndex, zIndex, totalXPositions, totalZPositions) {
        if (!this.audioContext || !this.sonificationController?.isEnabled || !this.navigationController) return;

        const wireframeRectangles = this.navigationController.wireframeRectangles;
        if (rectIndex < 0 || rectIndex >= wireframeRectangles.length) return;

        const rectangle = wireframeRectangles[rectIndex];
        
        // Visual highlighting: highlight the current wireframe rectangle
        if (this.highlightController) {
            // Clear any previous highlighting
            this.highlightController.clearWireframeHighlight();
            
            // Enable wireframe highlighting and highlight current rectangle
            this.highlightController.setWireframeHighlightEnabled(true);
            this.highlightController.setHighlightedWireframeRectangle(rectIndex);
            
            this.logger?.debug(`Autoplay highlighting wireframe rectangle ${rectIndex} at grid position (${xIndex}, ${zIndex})`);
        }

        // Update NavigationController to sync with autoplay for consistent state
        if (this.navigationController) {
            this.navigationController.currentWireframeRectIndex = rectIndex;
            this.navigationController.currentWireframeXIndex = xIndex;
            this.navigationController.currentWireframeZIndex = zIndex;
        }

        // Audio feedback: play sound based on rectangle's average Y value
        if (rectangle && rectangle.avgY !== undefined) {
            // Create audio nodes
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            // Map rectangle's average Y value to frequency
            const dataRange = this.dataController.getDataRange();
            const normalizedY = (rectangle.avgY - dataRange.y.min) / (dataRange.y.max - dataRange.y.min);
            
            const minFreq = 200;
            const maxFreq = 800; // Slightly lower range for wireframe rectangles
            const frequency = minFreq + normalizedY * (maxFreq - minFreq);
            
            // Configure oscillator
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            
            // Configure volume envelope - slightly longer for wireframes
            const volume = 0.4 + normalizedY * 0.3; // 0.4 to 0.7 range
            const duration = 0.2; // 200ms duration for rectangles
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.02);
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
            
            // Connect and play
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + duration);
            
            this.logger?.debug(`Autoplay wireframe rectangle ${rectIndex} - Grid(${xIndex + 1}/${totalXPositions}, ${zIndex + 1}/${totalZPositions}) → freq:${frequency.toFixed(0)}Hz, vol:${volume.toFixed(2)}`);
        }
    }

    /**
     * Fast wireframe autoplay - intelligent grouping with adaptive timing for peaks/troughs
     */
    startFastWireframeAutoplay() {
        if (!this.navigationController?.wireframeGrid) {
            this.logger?.warn('Cannot start fast wireframe autoplay - wireframe grid not available');
            this.autoplayActive = false;
            return;
        }

        const wireframeGrid = this.navigationController.wireframeGrid;
        const xValues = wireframeGrid.xValues;
        const zValues = wireframeGrid.zValues;
        
        // Analyze wireframe data for peaks and significance to determine adaptive duration
        const dataRange = this.dataController.getDataRange();
        const yRange = dataRange.y.max - dataRange.y.min;
        
        // Count significant Y values in wireframe rectangles
        let significantRectCount = 0;
        let totalRectCount = 0;
        
        this.navigationController.wireframeRectangles.forEach(rectangle => {
            if (rectangle && rectangle.avgY !== undefined) {
                totalRectCount++;
                const normalizedY = (rectangle.avgY - dataRange.y.min) / yRange;
                if (normalizedY > 0.7 || normalizedY < 0.3) { // High peaks or low troughs
                    significantRectCount++;
                }
            }
        });
        
        // Calculate adaptive duration: extend for datasets with many significant values
        const baseDuration = 5000; // 5 seconds base duration
        const significanceRatio = significantRectCount / totalRectCount;
        const adaptiveFactor = Math.max(1.0, 1.0 + (significanceRatio * 2.0)); // 1x to 3x duration
        const totalDuration = Math.min(baseDuration * adaptiveFactor, 15000); // Cap at 15 seconds
        const rowPause = 150; // Shorter pauses between rows
        
        // Calculate adaptive timing
        const totalRows = zValues.length;
        const availableTime = totalDuration - (rowPause * (totalRows - 1));
        const timePerRow = availableTime / totalRows;
        
        let currentTime = 0;
        
        // Process each row
        for (let zIndex = 0; zIndex < zValues.length; zIndex++) {
            // Add pause before row (except first)
            if (zIndex > 0) {
                currentTime += rowPause;
            }
            
            // Collect rectangles in this row
            const rowRectangles = [];
            for (let xIndex = 0; xIndex < xValues.length; xIndex++) {
                const x = xValues[xIndex];
                const z = zValues[zIndex];
                const key = `${x},${z}`;
                const rectIndex = wireframeGrid.rectMap.get(key);
                
                if (rectIndex !== undefined) {
                    const rectangle = this.navigationController.wireframeRectangles[rectIndex];
                    if (rectangle) {
                        rowRectangles.push({
                            rectangle,
                            rectIndex,
                            xIndex,
                            zIndex
                        });
                    }
                }
            }
            
            // Play continuous sweep for this wireframe row with dynamic intensity for peaks
            if (rowRectangles.length > 0) {
                const timeoutId = setTimeout(() => {
                    if (this.autoplayActive && this.fastAutoplayMode) {
                        this.playContinuousWireframeSweep(rowRectangles, zIndex, zValues.length, timePerRow);
                    }
                }, currentTime);
                
                this.autoplayTimeouts.push(timeoutId);
            }
            currentTime += timePerRow;
        }
        
        // Schedule completion
        const completionTimeoutId = setTimeout(() => {
            this.stopAutoplay();
            if (this.textController) {
                this.textController.announceToScreenReader('Fast autoplay completed');
            }
        }, totalDuration + 500);
        
        this.autoplayTimeouts.push(completionTimeoutId);
    }

    /**
     * Play continuous wireframe sweep with dynamic intensity for peaks
     */
    playContinuousWireframeSweep(rectangleData, rowIndex, totalRows, duration) {
        if (!this.audioContext || rectangleData.length === 0) return;

        // Sort rectangles left to right
        const sortedRectangles = rectangleData.sort((a, b) => a.xIndex - b.xIndex);
        
        // Start with first rectangle
        const firstRect = sortedRectangles[0];
        const dataRange = this.dataController.getDataRange();
        const yRange = dataRange.y.max - dataRange.y.min;
        
        // Create continuous oscillator and gain for the entire row
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Initial settings based on first rectangle
        const initialNormalizedY = (firstRect.rectangle.avgY - dataRange.y.min) / yRange;
        const initialFrequency = 200 + initialNormalizedY * 600;
        const initialVolume = 0.3 + initialNormalizedY * 0.4;
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(initialFrequency, this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(initialVolume, this.audioContext.currentTime);
        
        // Connect and start
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.start();
        
        // Schedule frequency and volume changes for each rectangle
        const durationPerRect = duration / sortedRectangles.length;
        let currentTime = this.audioContext.currentTime + 0.02;
        
        sortedRectangles.forEach((rectData, index) => {
            if (index === 0) return; // Skip first rectangle, already set
            
            const normalizedY = (rectData.rectangle.avgY - dataRange.y.min) / yRange;
            const frequency = 200 + normalizedY * 600;
            
            // Determine if this is a significant peak/trough for volume emphasis
            const isSignificantPeak = normalizedY > 0.7 || normalizedY < 0.3;
            const baseVolume = 0.3 + normalizedY * 0.4; // 0.3 to 0.7 range
            const emphasisVolume = isSignificantPeak ? Math.min(baseVolume * 1.5, 0.8) : baseVolume;
            
            // Schedule frequency change
            oscillator.frequency.linearRampToValueAtTime(frequency, currentTime);
            
            // Schedule volume change for peak emphasis
            gainNode.gain.linearRampToValueAtTime(emphasisVolume, currentTime);
            
            // Visual highlighting for significant peaks
            if (isSignificantPeak && this.highlightController) {
                const highlightDelay = (currentTime - this.audioContext.currentTime) * 1000;
                setTimeout(() => {
                    if (this.autoplayActive && this.fastAutoplayMode) {
                        this.highlightController.setWireframeHighlightEnabled(true);
                        this.highlightController.setHighlightedWireframeRectangle(rectData.rectIndex);
                        
                        // Update navigation state
                        if (this.navigationController) {
                            this.navigationController.currentWireframeRectIndex = rectData.rectIndex;
                            this.navigationController.currentWireframeXIndex = rectData.xIndex;
                            this.navigationController.currentWireframeZIndex = rectData.zIndex;
                        }
                    }
                }, highlightDelay);
            }
            
            currentTime += durationPerRect / 1000; // Convert to seconds
        });
        
        // Stop oscillator at the end
        oscillator.stop(this.audioContext.currentTime + duration / 1000);
        
        this.logger?.debug(`Fast wireframe sweep - Row ${rowIndex + 1}/${totalRows}, ${sortedRectangles.length} rectangles, ${duration}ms`);
    }

    /**
     * Update NavigationController's current segment to follow autoplay point for white segment highlighting
     */
    updateNavigationSegmentForAutoplay(point) {
        if (!this.navigationController || !point) return;

        try {
            // Determine which segment this point belongs to based on navigation axis
            if (this.navigationController.navigationAxis === 'z') {
                // Z-axis navigation: find Z segment that contains this point
                const zSegments = this.navigationController.zSegments;
                for (let i = 0; i < zSegments.length; i++) {
                    const segment = zSegments[i];
                    if (segment && segment.points) {
                        // Check if this point's index is in this segment
                        const pointInSegment = segment.points.find(p => p.index === point.index);
                        if (pointInSegment) {
                            // Update the navigation controller's current Z segment
                            if (this.navigationController.currentZSegment !== i) {
                                this.navigationController.currentZSegment = i;
                                // Trigger buffer recreation to update white segment highlighting
                                if (this.navigationController.engine) {
                                    this.navigationController.engine.createBuffers();
                                }
                                this.logger?.debug(`Autoplay: Updated Z segment to ${i + 1}/${zSegments.length} for point ${point.index}`);
                            }
                            break;
                        }
                    }
                }
            } else {
                // Y-axis navigation: find Y segment that contains this point
                const ySegments = this.navigationController.ySegments;
                for (let i = 0; i < ySegments.length; i++) {
                    const segment = ySegments[i];
                    if (segment && segment.points) {
                        // Check if this point's index is in this segment
                        const pointInSegment = segment.points.find(p => p.index === point.index);
                        if (pointInSegment) {
                            // Update the navigation controller's current Y segment
                            if (this.navigationController.currentYSegment !== i) {
                                this.navigationController.currentYSegment = i;
                                // Trigger buffer recreation to update white segment highlighting
                                if (this.navigationController.engine) {
                                    this.navigationController.engine.createBuffers();
                                }
                                this.logger?.debug(`Autoplay: Updated Y segment to ${i + 1}/${ySegments.length} for point ${point.index}`);
                            }
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            this.logger?.warn('Error updating navigation segment for autoplay:', error);
        }
    }

    /**
     * Get current autoplay state
     * @returns {Object} Current state object
     */
    getState() {
        return {
            active: this.autoplayActive,
            mode: this.autoplayMode,
            fastMode: this.fastAutoplayMode,
            currentPointIndex: this.autoplayCurrentPointIndex
        };
    }

    /**
     * Clean up all autoplay resources and event listeners
     */
    destroy() {
        // Stop autoplay if active
        this.stopAutoplay();
        
        // Clear any remaining highlighting
        if (this.highlightController) {
            if (this.autoplayCurrentPointIndex !== -1) {
                this.highlightController.clearHighlight();
                this.autoplayCurrentPointIndex = -1;
            }
            // Also clear wireframe highlighting
            this.highlightController.clearWireframeHighlight();
            this.highlightController.setWireframeHighlightEnabled(false);
        }
        
        this.logger?.debug('AutoPlayController destroyed and cleaned up');
    }
} 