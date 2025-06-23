/**
 * HighlightController.js
 * Manages visual highlighting of selected points in the visualization.
 * Integrates with NavigationController and VisualizationEngine to provide
 * clear visual feedback for the currently selected point.
 */

export class HighlightController {
    constructor(visualizationEngine, dataController = null) {
        this.visualizationEngine = visualizationEngine;
        this.dataController = dataController;
        this.isEnabled = false; // Start disabled - only enable when navigation mode is active
        this.highlightColor = [1.0, 0.0, 1.0, 1.0]; // Bright magenta for maximum contrast
        this.highlightSizeMultiplier = 4.0; // 4x size increase
        this.currentPoint = null;
        this.currentPointIndex = -1; // Track the index of the highlighted point
        
        // Wireframe highlighting properties - independent from point highlighting
        this.wireframeHighlightEnabled = false;
        this.currentWireframeRectangle = null; // Currently highlighted rectangle in wireframe
        this.wireframeRectangles = []; // All available rectangles for wireframe navigation
        this.currentWireframeIndex = -1; // Index of currently highlighted rectangle
        this.wireframeHighlightColor = [1.0, 1.0, 1.0, 1.0]; // White for wireframe highlighting
    }
    
    /**
     * Set dependencies after construction (called by NavigationController)
     */
    setDependencies(dataController) {
        this.dataController = dataController;
    }

    /**
     * Initialize the highlight controller
     */
    async initialize() {
        // No longer need separate shader resources
        // Start with no highlighting - will only activate when navigation mode is enabled
        this.currentPoint = null;
        this.currentPointIndex = -1;
        console.log('HighlightController initialized - highlighting disabled until navigation mode is active');
    }

    /**
     * Set the highlighted point by index
     * @param {number} index - The index of the point to highlight
     */
    setHighlightedPoint(index) {
        if (!this.isEnabled || index < 0) {
            this.clearHighlight();
            return;
        }
        
        this.currentPointIndex = index;
        this.currentPoint = { index }; // Simple point reference
        
        // Trigger a re-render to show the highlight
        if (this.visualizationEngine && this.currentPointIndex >= 0) {
            console.log(`[DEBUG] HighlightController: Highlighting point at index ${this.currentPointIndex} with magenta color and 4x size`);
            this.visualizationEngine.createBuffers(); // Recreate buffers with highlight
        }
    }

    /**
     * Update the currently highlighted point (legacy method for backward compatibility)
     * @param {Object} point - The point to highlight (contains x, y, z coordinates)
     */
    updateHighlight(point) {
        if (!this.isEnabled || !point) {
            this.clearHighlight();
            return;
        }
        
        this.currentPoint = point;
        
        // Find the index of this point in the current data
        this.currentPointIndex = this.findPointIndex(point);
        
        // Trigger a re-render to show the highlight
        if (this.visualizationEngine && this.currentPointIndex >= 0) {
            console.log('Highlighting point at index:', this.currentPointIndex, 'with magenta color and 4x size');
            this.visualizationEngine.createBuffers(); // Recreate buffers with highlight
        }
    }

    /**
     * Clear the current highlight
     */
    clearHighlight() {
        if (this.currentPoint !== null || this.currentPointIndex !== -1) {
            console.log('Clearing highlight - was highlighting point index:', this.currentPointIndex);
        }
        this.currentPoint = null;
        this.currentPointIndex = -1;
        console.log('Highlight cleared - currentPointIndex now:', this.currentPointIndex);
        
        // CRITICAL FIX: Only trigger buffer recreation if highlighting is enabled
        // This prevents interference with normal rendering during sample loading
        if (this.visualizationEngine && this.isEnabled) {
            console.log('Triggering buffer recreation to remove highlight');
            this.visualizationEngine.createBuffers(); // Recreate buffers without highlight
        }
    }

    /**
     * Find the index of a point in the current dataset
     * @param {Object} point - The point with x, y, z coordinates
     * @returns {number} - The index of the point, or -1 if not found
     */
    findPointIndex(point) {
        // Get the current data from the data controller
        if (!this.dataController) return -1;

        const xValues = this.dataController.xValues || [];
        const zValues = this.dataController.zValues || [];
        const yValues = this.dataController.yValues || [];

        // Get data ranges for dynamic coordinate transformation
        const dataRange = this.dataController.getDataRange();
        if (!dataRange) return -1;

        // Convert the normalized point coordinates back to original values
        const x = ((point.x + 1) / 2) * (dataRange.x.max - dataRange.x.min) + dataRange.x.min;
        const z = ((point.z + 1) / 2) * (dataRange.z.max - dataRange.z.min) + dataRange.z.min;
        const y = this.visualizationEngine.denormalizeYCoordinate(point.y, dataRange); // Dynamic Y denormalization

        // Find the closest matching point with tolerance for floating point comparison
        const tolerance = 0.01;
        for (let i = 0; i < xValues.length; i++) {
            if (Math.abs(xValues[i] - x) < tolerance && 
                Math.abs(zValues[i] - z) < tolerance && 
                Math.abs(yValues[i] - y) < tolerance) {
                return i;
            }
        }
        
        return -1;
    }

    /**
     * Check if a point at the given index should be highlighted
     * @param {number} index - The index of the point to check
     * @returns {boolean} - True if the point should be highlighted
     */
    isPointHighlighted(index) {
        // Only highlight if enabled AND we have a valid highlighted point index
        const result = this.isEnabled && this.currentPointIndex !== -1 && this.currentPointIndex === index;
        
        // Log every 1000th point or highlighted points for debugging
        if (index % 1000 === 0 || result) {
            console.log(`[DEBUG] HighlightController.isPointHighlighted(${index}): enabled=${this.isEnabled}, currentIndex=${this.currentPointIndex}, result=${result}`);
        }
        
        return result;
    }

    /**
     * Get the highlight color
     * @returns {Array} - RGBA color array for highlighted points
     */
    getHighlightColor() {
        return this.highlightColor;
    }

    /**
     * Get the highlight size multiplier
     * @returns {number} - Size multiplier for highlighted points
     */
    getHighlightSizeMultiplier() {
        return this.highlightSizeMultiplier;
    }

    /**
     * Toggle highlight visibility
     * @param {boolean} enabled - Whether highlighting should be enabled
     */
    setEnabled(enabled) {
        console.log(`[DEBUG] HighlightController.setEnabled(${enabled}) - was: ${this.isEnabled}`);
        const wasEnabled = this.isEnabled;
        this.isEnabled = enabled;
        if (!enabled && wasEnabled) {
            // Only clear highlight if we were previously enabled to avoid unnecessary buffer recreation
            console.log(`[DEBUG] Highlighting disabled - clearing highlight`);
            this.clearHighlight();
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        // No WebGL resources to clean up anymore
        this.clearHighlight();
    }

    /**
     * === WIREFRAME HIGHLIGHTING METHODS ===
     * These methods handle highlighting of wireframe rectangles independently from point highlighting
     */

    /**
     * Initialize wireframe highlighting system
     * @param {Array} rectangles - Array of wireframe rectangles for navigation
     */
    initializeWireframeHighlighting(rectangles) {
        this.wireframeRectangles = rectangles || [];
        this.currentWireframeIndex = -1;
        this.currentWireframeRectangle = null;
        console.log(`[DEBUG] HighlightController: Initialized wireframe highlighting with ${this.wireframeRectangles.length} rectangles`);
    }

    /**
     * Enable/disable wireframe highlighting mode
     * @param {boolean} enabled - Whether wireframe highlighting should be enabled
     */
    setWireframeHighlightEnabled(enabled) {
        console.log(`[DEBUG] HighlightController.setWireframeHighlightEnabled(${enabled}) - was: ${this.wireframeHighlightEnabled}`);
        this.wireframeHighlightEnabled = enabled;
        if (!enabled) {
            this.clearWireframeHighlight();
        }
    }

    /**
     * Set the highlighted wireframe rectangle by index
     * @param {number} index - The index of the rectangle to highlight
     */
    setHighlightedWireframeRectangle(index) {
        if (!this.wireframeHighlightEnabled || index < 0 || index >= this.wireframeRectangles.length) {
            this.clearWireframeHighlight();
            return;
        }
        
        this.currentWireframeIndex = index;
        this.currentWireframeRectangle = this.wireframeRectangles[index];
        
        console.log(`[DEBUG] HighlightController: Highlighting wireframe rectangle at index ${this.currentWireframeIndex}`);
        
        // Trigger a re-render to show the wireframe highlight
        if (this.visualizationEngine && this.currentWireframeIndex >= 0) {
            this.visualizationEngine.createBuffers();
        }
    }

    /**
     * Clear the current wireframe highlight
     */
    clearWireframeHighlight() {
        if (this.currentWireframeRectangle !== null || this.currentWireframeIndex !== -1) {
            console.log('Clearing wireframe highlight - was highlighting rectangle index:', this.currentWireframeIndex);
        }
        this.currentWireframeRectangle = null;
        this.currentWireframeIndex = -1;
        
        // Trigger a re-render to remove the wireframe highlight
        if (this.visualizationEngine) {
            console.log('Triggering buffer recreation to remove wireframe highlight');
            this.visualizationEngine.createBuffers();
        }
    }

    /**
     * Check if a wireframe rectangle at the given index should be highlighted
     * @param {number} index - The index of the rectangle to check
     * @returns {boolean} - True if the rectangle should be highlighted
     */
    isWireframeRectangleHighlighted(index) {
        const result = this.wireframeHighlightEnabled && 
                      this.currentWireframeIndex !== -1 && 
                      this.currentWireframeIndex === index;
        return result;
    }

    /**
     * Get the wireframe highlight color
     * @returns {Array} - RGBA color array for highlighted wireframe rectangles
     */
    getWireframeHighlightColor() {
        return this.wireframeHighlightColor;
    }

    /**
     * Get the currently highlighted wireframe rectangle data
     * @returns {Object|null} - Current wireframe rectangle data or null
     */
    getCurrentWireframeRectangle() {
        return this.currentWireframeRectangle;
    }

    /**
     * Get the total number of navigable wireframe rectangles
     * @returns {number} - Number of wireframe rectangles
     */
    getWireframeRectangleCount() {
        return this.wireframeRectangles.length;
    }
}

 