// VisualizationEngine.js - WebGL rendering engine
import { Shaders } from '../shaders/Shaders.js';
import { EngineLogger } from '../utils/Logger.js';

export class VisualizationEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.shaderProgram = null;
        this.lineShaderProgram = null;
        this.buffers = null;
        this.rotationX = 38;
        this.rotationY = 45;
        this.zoom = 1.0;
        this.currentDisplayMode = 'surface';
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 60;
        this.highlightController = null;
        
        // Dependencies injected by coordinator
        this.uiController = null;
        this.navigationController = null;
        this.dataController = null;
        
        // Track event listeners for cleanup
        this.eventListeners = new Map();
    }
    
    /**
     * Set dependencies after construction (called by app.js coordinator)
     */
    setDependencies(uiController, navigationController, dataController) {
        this.uiController = uiController;
        this.navigationController = navigationController;
        this.dataController = dataController;
    }    initialize() {
        this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true }) || 
                 this.canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
        
        if (!this.gl) {
            EngineLogger.error('Failed to get WebGL context');
            throw new Error('WebGL not supported');
        }

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        // Initialize shaders
        try {
            const shaders = Shaders.initializeShaders(this.gl);
            this.shaderProgram = shaders.pointShader;
            this.lineShaderProgram = shaders.lineShader;
        } catch (error) {
            EngineLogger.error('Failed to initialize shaders:', error);
            throw error;
        }

        // Set up mouse interactions and other event listeners
        this.setupEventListeners();
        
        return true;
    }    setupEventListeners() {
        // Setup mouse interaction for 3D navigation
        let mouseDown = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        const mouseDownHandler = (event) => {
            mouseDown = true;
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
        };
        this.canvas.addEventListener('mousedown', mouseDownHandler);
        this.eventListeners.set('mousedown', { element: this.canvas, event: 'mousedown', handler: mouseDownHandler });
        
        const mouseUpHandler = () => {
            mouseDown = false;
        };
        this.canvas.addEventListener('mouseup', mouseUpHandler);
        this.eventListeners.set('mouseup', { element: this.canvas, event: 'mouseup', handler: mouseUpHandler });
        
        const mouseMoveHandler = (event) => {
            if (!mouseDown) return;
            
            const deltaX = event.clientX - lastMouseX;
            const deltaY = event.clientY - lastMouseY;
            
            this.rotationY += deltaX * 0.5;
            this.rotationX += deltaY * 0.5;
            
            // Clamp rotation X to avoid flipping
            this.rotationX = Math.max(-90, Math.min(90, this.rotationX));
            
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
        };
        this.canvas.addEventListener('mousemove', mouseMoveHandler);
        this.eventListeners.set('mousemove', { element: this.canvas, event: 'mousemove', handler: mouseMoveHandler });
        
        const wheelHandler = (event) => {
            event.preventDefault();
            const delta = Math.sign(event.deltaY) * 0.1;
            this.zoom = Math.max(0.1, this.zoom - delta);
        };
        this.canvas.addEventListener('wheel', wheelHandler);
        this.eventListeners.set('wheel', { element: this.canvas, event: 'wheel', handler: wheelHandler });
        
        // Prevent context menu on right-click
        const contextMenuHandler = (event) => {
            event.preventDefault();
        };
        this.canvas.addEventListener('contextmenu', contextMenuHandler);
        this.eventListeners.set('contextmenu', { element: this.canvas, event: 'contextmenu', handler: contextMenuHandler });
    }

    render(data) {
        if (!this.gl || !this.shaderProgram) {
            EngineLogger.warn('WebGL or shaders not ready');
            return;
        }
        
        // Always clear the canvas and set up the viewport, even if we don't have data yet
        this.resizeCanvasToDisplaySize();
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        
        this.gl.clearColor(0.02, 0.02, 0.08, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // If we don't have buffers yet, just clear the canvas and return
        if (!this.buffers) {
            EngineLogger.debug('Buffers not ready, clearing canvas');
            return;
        }
        
        // Additional check for line shader when using line-based modes
        if (this.currentDisplayMode === 'surface' && !this.lineShaderProgram) {
            EngineLogger.warn('Line shader program not available for mode:', this.currentDisplayMode);
            return;
        }

        const projectionMatrix = this.createPerspectiveMatrix();
        const modelViewMatrix = this.createModelViewMatrix();

        this.renderMode(projectionMatrix, modelViewMatrix);

        // Render axes through UIController if available
        if (this.uiController) {
            this.uiController.renderAxes(projectionMatrix, modelViewMatrix);
        }

        // EngineLogger.debug('Rendering, buffer mode:', this.buffers?.mode, 'Count:', this.buffers?.count);
    }

    hasEmptyBuffers() {
        return !this.buffers || this.buffers.mode === 'empty' || this.buffers.count === 0;
    }

    renderMode(projectionMatrix, modelViewMatrix) {
        // Handle empty buffers
        if (this.hasEmptyBuffers()) {
            return;
        }
        
        switch(this.currentDisplayMode) {
            case 'surface':
                if (this.buffers?.mode === 'hybrid_mesh') {
                    this.renderMeshWithGrid(projectionMatrix, modelViewMatrix);
                } else {
                    this.renderSurface(projectionMatrix, modelViewMatrix);
                }
                break;
            default:
                this.renderPoints(projectionMatrix, modelViewMatrix);
        }
    }

    createBuffers() {
        EngineLogger.debug('VisualizationEngine.createBuffers() called');
        if (!this.gl || !this.shaderProgram) {
            EngineLogger.debug(`createBuffers early exit: gl=${!!this.gl}, shaderProgram=${!!this.shaderProgram}`);
            return;
        }

        // Get current parameters from UI
        this.currentDisplayMode = document.getElementById('displayMode')?.value || 'surface';
        
        // Create arrays for different visualization types
        const positions = [];
        const colors = [];
        const pointSizes = [];
        const indices = [];
        const linePositions = [];
        const lineColors = [];
        
        // Get the data and ranges dynamically
        const data = this.dataController;
        if (!data || !data.xValues || !data.zValues || !data.yValues || 
            data.xValues.length === 0 || data.zValues.length === 0 || data.yValues.length === 0) {
            EngineLogger.debug('No data available for buffer creation - creating empty buffers');
            
            // Create empty buffers to render black canvas
            this.buffers = {
                position: this.gl.createBuffer(),
                color: this.gl.createBuffer(),
                count: 0,
                mode: 'empty'
            };
            
            // Bind empty buffers
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([]), this.gl.STATIC_DRAW);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.color);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([]), this.gl.STATIC_DRAW);
            
            return;
        }
        
        const dataRange = data.getDataRange();
        if (!dataRange) {
            EngineLogger.warn('No data range available');
            return;
        }
        
        // Get UI filter parameters
        const xStart = parseFloat(document.getElementById('xStart')?.value || dataRange.x.min);
        const xEnd = parseFloat(document.getElementById('xEnd')?.value || dataRange.x.max);
        const zStart = parseFloat(document.getElementById('zStart')?.value || dataRange.z.min);
        const zEnd = parseFloat(document.getElementById('zEnd')?.value || dataRange.z.max);
        const threshold = parseFloat(document.getElementById('threshold')?.value || dataRange.y.min);
        const colorScheme = document.getElementById('colorScheme')?.value || 'rainbow';
        
        // Map point size: 1 -> 6px, 10 -> 10px, linear in between
        const sliderVal = parseInt(document.getElementById('pointSize')?.value || 1, 10);
        const pointSize = sliderVal === 1 ? 12 : 12 + (sliderVal - 1) * (8 / 9);
        
        // Use generic coordinate arrays
        const xValues = data.xValues;
        const zValues = data.zValues;
        const yValues = data.yValues;

        // Create a data grid for advanced visualization modes
        const dataGrid = [];
        let validPoints = 0;

        // Determine grid resolution based on data characteristics
        const xRange = dataRange.x.max - dataRange.x.min;
        const zRange = dataRange.z.max - dataRange.z.min;
        // Use fewer grid cells for better density with scattered data
        const gridResolution = Math.max(10, Math.min(50, Math.sqrt(xValues.length) / 4));
        const xStep = xRange / gridResolution;
        const zStep = zRange / gridResolution;

        // Fill the grid for structured data access
        for (let i = 0; i < xValues.length; i++) {
            const x = xValues[i];
            const z = zValues[i];
            const y = yValues[i];
            
            // Apply filters
            if (x >= xStart && x <= xEnd && 
                z >= zStart && z <= zEnd && 
                y >= threshold) {
                
                const xIndex = Math.round((x - dataRange.x.min) / xStep);
                const zIndex = Math.round((z - dataRange.z.min) / zStep);
                
                if (!dataGrid[xIndex]) dataGrid[xIndex] = [];
                dataGrid[xIndex][zIndex] = {
                    x, z, y,
                    nx: (x - dataRange.x.min) / (dataRange.x.max - dataRange.x.min) * 2 - 1, // Normalized X
                    ny: this.normalizeYCoordinate(y, dataRange), // Dynamic Y normalization
                    nz: (z - dataRange.z.min) / (dataRange.z.max - dataRange.z.min) * 2 - 1  // Normalized Z
                };
                validPoints++;
            }
        }

        // Analyze grid density for debugging
        let filledCells = 0;
        let maxFilledInRow = 0;
        for (let xIndex = 0; xIndex < dataGrid.length; xIndex++) {
            if (dataGrid[xIndex]) {
                let filledInThisRow = 0;
                for (let zIndex = 0; zIndex < dataGrid[xIndex].length; zIndex++) {
                    if (dataGrid[xIndex][zIndex]) {
                        filledCells++;
                        filledInThisRow++;
                    }
                }
                maxFilledInRow = Math.max(maxFilledInRow, filledInThisRow);
            }
        }
        
        EngineLogger.debug(`Data grid created: ${validPoints} valid points from ${xValues.length} total points`);
        EngineLogger.debug(`Grid structure: ${dataGrid.length} x-indices, ${filledCells} filled cells, max ${maxFilledInRow} filled per row`);

        // Generate visualization data based on mode
        if (this.currentDisplayMode === 'surface') {
            // Arrays for surface - filled rectangles with black grid overlay (formerly wireframe)
            const linePositions = [];
            const lineColors = [];
            const filledPositions = [];
            const filledColors = [];
            const filledIndices = [];
            
            // CRITICAL FIX: Ensure wireframe generation works regardless of navigation state
            try {
                this.generateWireframe(dataGrid, linePositions, lineColors, colorScheme, filledPositions, filledColors, filledIndices);
                validPoints = Math.max(linePositions.length / 3, filledPositions.length / 3);
                EngineLogger.debug(`Generated wireframe: ${linePositions.length / 6} lines, ${filledPositions.length / 3} filled vertices`);
            } catch (error) {
                EngineLogger.error('Error generating wireframe:', error);
                // Fallback to empty arrays if wireframe generation fails
                validPoints = 0;
            }
            
            // Create hybrid buffers for filled mesh with black grid overlay
            // CRITICAL FIX: Ensure buffer creation succeeds even with limited data
            if (filledPositions.length > 0 && filledIndices.length > 0) {
                this.buffers = {
                    // Triangle buffers for filled colored rectangles
                    position: this.gl.createBuffer(),
                    color: this.gl.createBuffer(),
                    indices: this.gl.createBuffer(),
                    count: filledIndices.length,
                    
                    // Line buffers for black grid overlay
                    linePosition: this.gl.createBuffer(),
                    lineColor: this.gl.createBuffer(),
                    lineCount: linePositions.length / 3,
                    
                    mode: 'hybrid_mesh' // Special mode for filled mesh with grid overlay
                };
                
                // Set up triangle buffers for filled rectangles
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(filledPositions), this.gl.STATIC_DRAW);
                
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.color);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(filledColors), this.gl.STATIC_DRAW);
                
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
                this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(filledIndices), this.gl.STATIC_DRAW);
                
                // Set up line buffers for black grid overlay
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.linePosition);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(linePositions), this.gl.STATIC_DRAW);
                
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.lineColor);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(lineColors), this.gl.STATIC_DRAW);
                
                EngineLogger.debug(`Surface buffers created successfully: ${this.buffers.count} triangles, ${this.buffers.lineCount} lines`);
            } else {
                // Fallback to points mode if surface generation fails
                EngineLogger.warn('Surface generation failed - falling back to points mode');
                this.generatePointsWithHighlighting(
                    xValues, zValues, yValues, 
                    positions, colors, pointSizes, 
                    colorScheme, pointSize, 
                    xStart, xEnd, zStart, zEnd, threshold,
                    dataRange
                );
                validPoints = positions.length / 3;
                
                this.buffers = {
                    position: this.gl.createBuffer(),
                    color: this.gl.createBuffer(),
                    pointSize: this.gl.createBuffer(),
                    mode: 'points',
                    count: validPoints
                };
                
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
                
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.color);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);
                
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.pointSize);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(pointSizes), this.gl.STATIC_DRAW);
            }
            
        } else {
            // Points mode with highlighting
            this.generatePointsWithHighlighting(
                xValues, zValues, yValues, 
                positions, colors, pointSizes, 
                colorScheme, pointSize, 
                xStart, xEnd, zStart, zEnd, threshold,
                dataRange
            );
            validPoints = positions.length / 3;
            
            // Create point buffers
            this.buffers = {
                position: this.gl.createBuffer(),
                color: this.gl.createBuffer(),
                pointSize: this.gl.createBuffer(),
                mode: 'points',
                count: validPoints
            };
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.color);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.pointSize);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(pointSizes), this.gl.STATIC_DRAW);
        }
        
        EngineLogger.debug(`Buffers created for mode '${this.currentDisplayMode}' with ${validPoints} points`);
        
        // Update performance counter
                    if (this.uiController) {
                this.uiController.updatePerformanceMetrics(this.fps, validPoints);
            }
    }
    

    
    renderPoints(projectionMatrix, modelViewMatrix) {
        if (!this.buffers || this.buffers.count === 0 || this.buffers.mode !== 'points') {
            return;
        }
        
        const gl = this.gl;
        const program = this.shaderProgram;
        
        // Use the point shader program
        gl.useProgram(program);
        
        // Set the attribute and uniform values
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.vertexAttribPointer(program.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.vertexPositionAttribute);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.vertexAttribPointer(program.vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.vertexColorAttribute);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pointSize);
        gl.vertexAttribPointer(program.pointSizeAttribute, 1, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.pointSizeAttribute);
        
        // Set the matrices
        gl.uniformMatrix4fv(program.projectionMatrixUniform, false, projectionMatrix);
        gl.uniformMatrix4fv(program.modelViewMatrixUniform, false, modelViewMatrix);
        
        // Set the point scale based on device pixel ratio
        gl.uniform1f(program.pointScaleUniform, window.devicePixelRatio || 1.0);
        
        // Draw the points
        gl.drawArrays(gl.POINTS, 0, this.buffers.count);
    }
    
    renderSurface(projectionMatrix, modelViewMatrix) {
        if (!this.buffers || this.buffers.count === 0 || this.buffers.mode !== 'surface') {
            console.log('[DEBUG] renderSurface early exit:', {
                buffers: !!this.buffers,
                count: this.buffers?.count,
                mode: this.buffers?.mode
            });
            return;
        }
        
        console.log('[DEBUG] renderSurface rendering with', this.buffers.count, 'triangles');
        
        const gl = this.gl;
        const program = this.shaderProgram;
        
        // Use the shader program
        gl.useProgram(program);
        
        // Set the uniform values
        gl.uniformMatrix4fv(program.projectionMatrixUniform, false, projectionMatrix);
        gl.uniformMatrix4fv(program.modelViewMatrixUniform, false, modelViewMatrix);
        gl.uniform1f(program.pointScaleUniform, 1.0);
        
        // Set the attribute values
        gl.enableVertexAttribArray(program.vertexPositionAttribute);
        gl.enableVertexAttribArray(program.vertexColorAttribute);
        gl.disableVertexAttribArray(program.pointSizeAttribute);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.vertexAttribPointer(program.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.vertexAttribPointer(program.vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);
        
        // Draw the triangles
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
        gl.drawElements(gl.TRIANGLES, this.buffers.count, gl.UNSIGNED_SHORT, 0);
    }

    renderLines(projectionMatrix, modelViewMatrix) {
        if (!this.buffers || this.buffers.count === 0 || this.buffers.mode !== 'lines') {
            console.log('[DEBUG] renderLines early exit:', {
                buffers: !!this.buffers,
                count: this.buffers?.count,
                mode: this.buffers?.mode
            });
            return;
        }
        
        console.log('[DEBUG] renderLines rendering with', this.buffers.count, 'lines');
        
        const gl = this.gl;
        const program = this.lineShaderProgram;
        
        // Use the line shader program
        gl.useProgram(program);
        
        // Set the uniform values
        gl.uniformMatrix4fv(program.projectionMatrixUniform, false, projectionMatrix);
        gl.uniformMatrix4fv(program.modelViewMatrixUniform, false, modelViewMatrix);
        
        // Set the attribute values
        gl.enableVertexAttribArray(program.vertexPositionAttribute);
        gl.enableVertexAttribArray(program.vertexColorAttribute);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.vertexAttribPointer(program.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.vertexAttribPointer(program.vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);
        
                // Draw the lines
        gl.drawArrays(gl.LINES, 0, this.buffers.count);
    }
    
    renderMeshWithGrid(projectionMatrix, modelViewMatrix) {
        if (!this.buffers || this.buffers.mode !== 'hybrid_mesh') {
            return;
        }
        
        const gl = this.gl;
        
        // First, render the filled colored rectangles using surface shader
        if (this.buffers.count > 0) {
            const surfaceProgram = this.shaderProgram;
            gl.useProgram(surfaceProgram);
            
            // Set the uniform values
            gl.uniformMatrix4fv(surfaceProgram.projectionMatrixUniform, false, projectionMatrix);
            gl.uniformMatrix4fv(surfaceProgram.modelViewMatrixUniform, false, modelViewMatrix);
            gl.uniform1f(surfaceProgram.pointScaleUniform, 1.0);
            
            // Set the attribute values for triangles
            gl.enableVertexAttribArray(surfaceProgram.vertexPositionAttribute);
            gl.enableVertexAttribArray(surfaceProgram.vertexColorAttribute);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
            gl.vertexAttribPointer(surfaceProgram.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
            gl.vertexAttribPointer(surfaceProgram.vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);
            
            // Draw the filled triangles
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
            gl.drawElements(gl.TRIANGLES, this.buffers.count, gl.UNSIGNED_SHORT, 0);
        }
        
        // Then, render the black grid lines on top using line shader
        if (this.buffers.lineCount > 0) {
            const lineProgram = this.lineShaderProgram;
            gl.useProgram(lineProgram);
            
            // Set the uniform values
            gl.uniformMatrix4fv(lineProgram.projectionMatrixUniform, false, projectionMatrix);
            gl.uniformMatrix4fv(lineProgram.modelViewMatrixUniform, false, modelViewMatrix);
            
            // Set the attribute values for lines
            gl.enableVertexAttribArray(lineProgram.vertexPositionAttribute);
            gl.enableVertexAttribArray(lineProgram.vertexColorAttribute);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.linePosition);
            gl.vertexAttribPointer(lineProgram.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.lineColor);
            gl.vertexAttribPointer(lineProgram.vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);
            
            // Draw the grid lines
            gl.drawArrays(gl.LINES, 0, this.buffers.lineCount);
        }
    }

    // Helper methods for generating visualizations
    
    generatePoints(dataGrid, positions, colors, pointSizes, colorScheme, pointSize) {
        for (let xIndex = 0; xIndex < dataGrid.length; xIndex++) {
            if (!dataGrid[xIndex]) continue;
            
            for (let zIndex = 0; zIndex < dataGrid[xIndex].length; zIndex++) {
                const point = dataGrid[xIndex][zIndex];
                if (!point) continue;
                
                positions.push(point.nx, point.ny, point.nz);
                
                const color = this.getEnhancedColor(point.y, point.x, point.z, colorScheme);
                colors.push(color.r, color.g, color.b, color.a);
                
                pointSizes.push(pointSize * (0.5 + point.y));
            }
        }
    }

    generatePointsWithHighlighting(xValues, zValues, yValues, positions, colors, pointSizes, colorScheme, pointSize, xStart, xEnd, zStart, zEnd, threshold, dataRange) {
        console.log(`[DEBUG] generatePointsWithHighlighting: Processing ${xValues.length} total points`);
        let highlightedPointsCount = 0;
        let ySegmentHighlightedPointsCount = 0;
        
        // CRITICAL FIX: Only get segment indices if navigation is actually active
        // This prevents rendering issues when switching samples without focus
        const currentSegmentIndices = (this.navigationController?.isActive) ? 
            (this.navigationController?.getCurrentSegmentPointIndices() || new Set()) : 
            new Set();
        console.log(`[DEBUG] Segment highlighting: ${currentSegmentIndices.size} points in current segment (navigation active: ${this.navigationController?.isActive || false})`);
        
        // Iterate through original data to maintain index tracking for highlighting
        for (let i = 0; i < xValues.length; i++) {
            const x = xValues[i];
            const z = zValues[i];
            const y = yValues[i];
            
            // Apply filters
            if (x < xStart || x > xEnd || 
                z < zStart || z > zEnd || 
                y < threshold) {
                continue;
            }
            
            // Normalize coordinates to -1 to 1 range using dynamic data ranges
            const nx = (x - dataRange.x.min) / (dataRange.x.max - dataRange.x.min) * 2 - 1;
            const ny = this.normalizeYCoordinate(y, dataRange); // Dynamic Y normalization
            const nz = (z - dataRange.z.min) / (dataRange.z.max - dataRange.z.min) * 2 - 1;
            
            positions.push(nx, ny, nz);
            
            // Check if this point should be individually highlighted (magenta)
            // CRITICAL FIX: Only check for individual highlighting if navigation is active
            const isIndividuallyHighlighted = (this.navigationController?.isActive) && 
                this.highlightController && this.highlightController.isPointHighlighted(i);
            
            // Check if this point is in the current segment (white)
            const isInCurrentSegment = currentSegmentIndices.has(i);
            
            if (isIndividuallyHighlighted) {
                highlightedPointsCount++;
                // Use magenta color for individually highlighted point (takes priority over Y segment highlighting)
                const highlightColor = this.highlightController.getHighlightColor();
                colors.push(highlightColor[0], highlightColor[1], highlightColor[2], highlightColor[3]);
                
                // Increase size by multiplier for individually highlighted point
                const multiplier = this.highlightController.getHighlightSizeMultiplier();
                pointSizes.push(pointSize * (0.5 + y) * multiplier);
                
                console.log(`[DEBUG] Point ${i} individually highlighted: x=${x}, z=${z}, y=${y}, size=${pointSize * (0.5 + y) * multiplier}`);
            } else if (isInCurrentSegment) {
                ySegmentHighlightedPointsCount++;
                // Use white color for current segment points (but not individually highlighted)
                colors.push(1.0, 1.0, 1.0, 0.9); // White with slight transparency
                
                // Use slightly larger size for segment points for better visibility
                pointSizes.push(pointSize * (0.5 + y) * 1.2);
            } else {
                // Use normal color for points not in current segment
                const color = this.getEnhancedColor(y, x, z, colorScheme);
                colors.push(color.r, color.g, color.b, color.a * 0.6); // Dim other segments
                
                // Use normal size
                pointSizes.push(pointSize * (0.5 + y));
            }
        }
        
        console.log(`[DEBUG] generatePointsWithHighlighting complete: ${highlightedPointsCount} individually highlighted, ${ySegmentHighlightedPointsCount} segment highlighted, out of ${positions.length / 3} visible points`);
    }
    
    generateSurfaceMesh(dataGrid, positions, colors, indices, colorScheme) {
        console.log('[DEBUG] generateSurfaceMesh called with dataGrid length:', dataGrid.length);
        const vertexMap = new Map();
        let vertexIndex = 0;
        let triangleCount = 0;
        
        // Collect all valid points for alternative triangulation
        const allPoints = [];
        for (let xIndex = 0; xIndex < dataGrid.length; xIndex++) {
            if (!dataGrid[xIndex]) continue;
            
            for (let zIndex = 0; zIndex < dataGrid[xIndex].length; zIndex++) {
                if (dataGrid[xIndex][zIndex]) {
                    allPoints.push({
                        point: dataGrid[xIndex][zIndex],
                        xIndex,
                        zIndex
                    });
                }
            }
        }
        
        console.log('[DEBUG] generateSurfaceMesh found', allPoints.length, 'valid points in grid');
        
        if (allPoints.length < 3) {
            console.log('[DEBUG] generateSurfaceMesh: Not enough points for surface generation');
            return;
        }
        
        // Try grid-based quad generation first
        let quadsGenerated = 0;
        for (let xIndex = 0; xIndex < dataGrid.length - 1; xIndex++) {
            if (!dataGrid[xIndex]) continue;
            
            for (let zIndex = 0; zIndex < (dataGrid[xIndex]?.length || 0) - 1; zIndex++) {
                const p1 = dataGrid[xIndex] && dataGrid[xIndex][zIndex];
                const p2 = dataGrid[xIndex + 1] && dataGrid[xIndex + 1] && dataGrid[xIndex + 1][zIndex];
                const p3 = dataGrid[xIndex] && dataGrid[xIndex][zIndex + 1];
                const p4 = dataGrid[xIndex + 1] && dataGrid[xIndex + 1] && dataGrid[xIndex + 1][zIndex + 1];
                
                if (p1 && p2 && p3 && p4) {
                    // Create two triangles for the quad with optimized vertex reuse
                    const vertices = [p1, p2, p3, p4];
                    const vertexIndices = [];
                    
                    for (const vertex of vertices) {
                        const key = `${vertex.nx.toFixed(4)},${vertex.ny.toFixed(4)},${vertex.nz.toFixed(4)}`;
                        if (!vertexMap.has(key)) {
                            positions.push(vertex.nx, vertex.ny, vertex.nz);
                            const color = this.getEnhancedColor(vertex.y, vertex.x, vertex.z, colorScheme);
                            colors.push(color.r, color.g, color.b, color.a);
                            vertexMap.set(key, vertexIndex++);
                        }
                        vertexIndices.push(vertexMap.get(key));
                    }
                    
                    // Triangle 1: p1, p2, p3
                    indices.push(vertexIndices[0], vertexIndices[1], vertexIndices[2]);
                    // Triangle 2: p2, p4, p3
                    indices.push(vertexIndices[1], vertexIndices[3], vertexIndices[2]);
                    triangleCount += 2;
                    quadsGenerated++;
                }
            }
        }
        
        // If grid-based approach didn't generate enough triangles, use simpler triangulation
        if (quadsGenerated < 3 && allPoints.length >= 3) {
            console.log('[DEBUG] generateSurfaceMesh: Using fallback triangulation');
            
            // Simple fan triangulation from first point
            const centerPoint = allPoints[0].point;
            const centerKey = `${centerPoint.nx.toFixed(4)},${centerPoint.ny.toFixed(4)},${centerPoint.nz.toFixed(4)}`;
            
            if (!vertexMap.has(centerKey)) {
                positions.push(centerPoint.nx, centerPoint.ny, centerPoint.nz);
                const color = this.getEnhancedColor(centerPoint.y, centerPoint.x, centerPoint.z, colorScheme);
                colors.push(color.r, color.g, color.b, color.a);
                vertexMap.set(centerKey, vertexIndex++);
            }
            const centerIndex = vertexMap.get(centerKey);
            
            // Create triangles from center to consecutive edge points
            for (let i = 1; i < allPoints.length - 1; i++) {
                const p1 = allPoints[i].point;
                const p2 = allPoints[i + 1].point;
                
                const keys = [
                    `${p1.nx.toFixed(4)},${p1.ny.toFixed(4)},${p1.nz.toFixed(4)}`,
                    `${p2.nx.toFixed(4)},${p2.ny.toFixed(4)},${p2.nz.toFixed(4)}`
                ];
                
                const vertexIndices = [centerIndex];
                
                for (let j = 0; j < 2; j++) {
                    const key = keys[j];
                    const point = [p1, p2][j];
                    
                    if (!vertexMap.has(key)) {
                        positions.push(point.nx, point.ny, point.nz);
                        const color = this.getEnhancedColor(point.y, point.x, point.z, colorScheme);
                        colors.push(color.r, color.g, color.b, color.a);
                        vertexMap.set(key, vertexIndex++);
                    }
                    vertexIndices.push(vertexMap.get(key));
                }
                
                indices.push(vertexIndices[0], vertexIndices[1], vertexIndices[2]);
                triangleCount++;
            }
        }
        
        console.log('[DEBUG] generateSurfaceMesh created:', {
            vertices: positions.length / 3,
            triangles: triangleCount,
            indices: indices.length
        });
    }

    generateContourLines(dataGrid, positions, colors, colorScheme, threshold) {
        const contourLevels = [0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0];
        
        for (const level of contourLevels) {
            if (level < threshold) continue;
            
            for (let xIndex = 0; xIndex < dataGrid.length - 1; xIndex++) {
                if (!dataGrid[xIndex] || !dataGrid[xIndex + 1]) continue;
                
                for (let zIndex = 0; zIndex < Math.max(dataGrid[xIndex].length, dataGrid[xIndex + 1].length) - 1; zIndex++) {
                    const p1 = dataGrid[xIndex] && dataGrid[xIndex][zIndex];
                    const p2 = dataGrid[xIndex + 1] && dataGrid[xIndex + 1][zIndex];
                    const p3 = dataGrid[xIndex] && dataGrid[xIndex][zIndex + 1];
                    const p4 = dataGrid[xIndex + 1] && dataGrid[xIndex + 1][zIndex + 1];
                    
                    if (p1 && p2 && p3 && p4) {
                        // Check for contour crossings and create line segments
                        const crossings = this.findContourCrossings([p1, p2, p3, p4], level);
                        for (let i = 0; i < crossings.length - 1; i += 2) {
                            if (crossings[i + 1]) {
                                positions.push(crossings[i].nx, crossings[i].ny, crossings[i].nz);
                                positions.push(crossings[i + 1].nx, crossings[i + 1].ny, crossings[i + 1].nz);
                                
                                const color = this.getContourColor(level, colorScheme);
                                colors.push(color.r, color.g, color.b, color.a);
                                colors.push(color.r, color.g, color.b, color.a);
                            }
                        }
                    }
                }
            }
        }
    }

    generateWireframe(dataGrid, positions, colors, colorScheme, filledPositions = [], filledColors = [], filledIndices = []) {
        console.log('[DEBUG] generateWireframe called with dataGrid length:', dataGrid.length);
        let lineCount = 0;
        
        // Store wireframe rectangles for highlighting system
        const wireframeRectangles = [];
        
        // Alternative approach: create a wireframe from all filled grid points
        const allPoints = [];
        
        // First, collect all valid points
        for (let xIndex = 0; xIndex < dataGrid.length; xIndex++) {
            if (!dataGrid[xIndex]) continue;
            
            for (let zIndex = 0; zIndex < dataGrid[xIndex].length; zIndex++) {
                if (dataGrid[xIndex][zIndex]) {
                    allPoints.push({
                        point: dataGrid[xIndex][zIndex],
                        xIndex,
                        zIndex
                    });
                }
            }
        }
        
        console.log('[DEBUG] generateWireframe found', allPoints.length, 'valid points in grid');
        
        // If we have too few points for a proper grid, create a simple connection pattern
        if (allPoints.length < 10) {
            // Connect every point to its closest few neighbors
            for (let i = 0; i < allPoints.length; i++) {
                for (let j = i + 1; j < Math.min(i + 5, allPoints.length); j++) {
                    const p1 = allPoints[i].point;
                    const p2 = allPoints[j].point;
                    
                    // Check if this line should be highlighted
                    const lineIndex = Math.floor(lineCount / 2); // Each rectangle uses multiple lines
                    const isHighlighted = (this.navigationController?.isActive) && 
                                        this.highlightController && 
                                        this.highlightController.isWireframeRectangleHighlighted(lineIndex);
                    
                    positions.push(p1.nx, p1.ny, p1.nz, p2.nx, p2.ny, p2.nz);
                    
                    if (isHighlighted) {
                        // Use bright highlight color for highlighted wireframe elements
                        const highlightColor = this.highlightController.getWireframeHighlightColor();
                        colors.push(highlightColor[0], highlightColor[1], highlightColor[2], highlightColor[3]);
                        colors.push(highlightColor[0], highlightColor[1], highlightColor[2], highlightColor[3]);
                    } else {
                        // Use normal color scheme for wireframe
                        const color1 = this.getEnhancedColor(p1.y, p1.x, p1.z, colorScheme);
                        const color2 = this.getEnhancedColor(p2.y, p2.x, p2.z, colorScheme);
                        colors.push(color1.r, color1.g, color1.b, 0.8);
                        colors.push(color2.r, color2.g, color2.b, 0.8);
                    }
                    lineCount++;
                }
            }
        } else {
            // Use the enhanced grid-based approach with rectangle detection for 3D heatmap
            this.generateWireframeWithRectangles(dataGrid, allPoints, positions, colors, colorScheme, wireframeRectangles, filledPositions, filledColors, filledIndices);
            lineCount = positions.length / 6; // Each line uses 6 values (2 points * 3 coordinates)
        }
        
        // Initialize wireframe highlighting system with detected rectangles
        // CRITICAL FIX: Only initialize wireframe highlighting if navigation is active
        if (this.highlightController && this.navigationController?.isActive) {
            this.highlightController.initializeWireframeHighlighting(wireframeRectangles);
        } else if (this.highlightController) {
            // Store rectangles but don't initialize highlighting to avoid rendering issues
            this.highlightController.wireframeRectangles = wireframeRectangles;
        }
        
        console.log('[DEBUG] generateWireframe created:', {
            lines: lineCount,
            vertices: positions.length / 3,
            rectangles: wireframeRectangles.length,
            highlightVertices: positions.length / 3,
            highlightIndices: positions.length / 3
        });
    }

    /**
     * Generate wireframe with rectangle detection for 3D heatmap highlighting
     * @private
     */
    generateWireframeWithRectangles(dataGrid, allPoints, positions, colors, colorScheme, rectangles, filledPositions = [], filledColors = [], filledIndices = []) {
        const processedRectangles = new Set();
        
        // Iterate through grid to find rectangles formed by wireframe lines
        for (let xIndex = 0; xIndex < dataGrid.length - 1; xIndex++) {
            if (!dataGrid[xIndex] || !dataGrid[xIndex + 1]) continue;
            
            for (let zIndex = 0; zIndex < Math.min(dataGrid[xIndex].length, dataGrid[xIndex + 1].length) - 1; zIndex++) {
                const p1 = dataGrid[xIndex] && dataGrid[xIndex][zIndex];
                const p2 = dataGrid[xIndex + 1] && dataGrid[xIndex + 1][zIndex];
                const p3 = dataGrid[xIndex] && dataGrid[xIndex][zIndex + 1];
                const p4 = dataGrid[xIndex + 1] && dataGrid[xIndex + 1][zIndex + 1];
                
                if (p1 && p2 && p3 && p4) {
                    // Create a rectangle identifier
                    const rectId = `${xIndex}_${zIndex}`;
                    if (processedRectangles.has(rectId)) continue;
                    processedRectangles.add(rectId);
                    
                    // Create rectangle data for highlighting system
                    const rectangle = {
                        id: rectId,
                        corners: [p1, p2, p3, p4],
                        center: {
                            x: (p1.x + p2.x + p3.x + p4.x) / 4,
                            y: (p1.y + p2.y + p3.y + p4.y) / 4,
                            z: (p1.z + p2.z + p3.z + p4.z) / 4
                        },
                        avgY: (p1.y + p2.y + p3.y + p4.y) / 4
                    };
                    rectangles.push(rectangle);
                    
                    // Check if this rectangle should be highlighted
                    const rectIndex = rectangles.length - 1;
                    const isHighlighted = (this.navigationController?.isActive) && 
                                        this.highlightController && 
                                        this.highlightController.isWireframeRectangleHighlighted(rectIndex);
                    
                    // Create filled rectangle for all rectangles
                    const vertices = [p1, p2, p3, p4];
                    const vertexStartIndex = filledPositions.length / 3;
                    
                    // Add vertices to filled positions buffer with individual vertex colors for smooth transitions
                    for (const vertex of vertices) {
                        filledPositions.push(vertex.nx, vertex.ny, vertex.nz);
                        
                        if (isHighlighted) {
                            // Use white highlight color for highlighted rectangle
                            const highlightColor = this.highlightController.getWireframeHighlightColor();
                            filledColors.push(highlightColor[0], highlightColor[1], highlightColor[2], highlightColor[3]);
                        } else {
                            // Use enhanced color based on individual vertex Y value for smooth transitions
                            const vertexColor = this.getEnhancedColor(vertex.y, vertex.x, vertex.z, colorScheme);
                            filledColors.push(vertexColor.r, vertexColor.g, vertexColor.b, vertexColor.a);
                        }
                    }
                    
                    // Create two triangles for the filled rectangle
                    // Triangle 1: p1, p2, p3
                    filledIndices.push(vertexStartIndex + 0, vertexStartIndex + 1, vertexStartIndex + 2);
                    // Triangle 2: p2, p4, p3  
                    filledIndices.push(vertexStartIndex + 1, vertexStartIndex + 3, vertexStartIndex + 2);
                    
                    // Add black grid edges for ALL rectangles
                    const edges = [
                        [p1, p2], // Top edge
                        [p2, p4], // Right edge  
                        [p4, p3], // Bottom edge
                        [p3, p1]  // Left edge
                    ];
                    
                    for (const edge of edges) {
                        const [point1, point2] = edge;
                        positions.push(point1.nx, point1.ny, point1.nz, point2.nx, point2.ny, point2.nz);
                        
                        // Use black color for grid lines
                        colors.push(0.0, 0.0, 0.0, 0.8); // Black with slight transparency
                        colors.push(0.0, 0.0, 0.0, 0.8);
                    }
                }
            }
        }
        
        // All rectangles are now filled - no need for individual point connections
    }

    /**
     * Get heatmap color for wireframe rectangles based on Y value
     * @private
     */
    getWireframeHeatmapColor(yValue, colorScheme) {
        // Enhanced coloring for wireframe rectangles with higher intensity
        let r, g, b, a = 0.9; // Higher alpha for better visibility
        
        switch (colorScheme) {
            case 'grayscale':
                const intensity = Math.min(0.95, yValue * 1.5);
                r = g = b = intensity;
                break;
                
            case 'heatmap':
                r = Math.min(1.0, yValue * 3.0);
                g = Math.min(1.0, yValue * 2.0);
                b = Math.min(1.0, yValue * 0.8);
                break;
                
            case 'rainbow':
            default:
                // Enhanced rainbow coloring for wireframe
                const hue = (1.0 - Math.min(1.0, yValue * 1.5)) * 260; // Extended hue range
                const s = 0.9; // Higher saturation
                const v = 1.0; // Full brightness
                
                const hi = Math.floor(hue / 60) % 6;
                const f = hue / 60 - Math.floor(hue / 60);
                const p = v * (1 - s);
                const q = v * (1 - f * s);
                const t = v * (1 - (1 - f) * s);
                
                if (hi === 0) { r = v; g = t; b = p; }
                else if (hi === 1) { r = q; g = v; b = p; }
                else if (hi === 2) { r = p; g = v; b = t; }
                else if (hi === 3) { r = p; g = q; b = v; }
                else if (hi === 4) { r = t; g = p; b = v; }
                else { r = v; g = p; b = q; }
                break;
        }
        
        return { r, g, b, a };
    }

    findContourCrossings(quad, level) {
        const crossings = [];
        
        // Check each edge of the quad for crossings
        const edges = [
            [quad[0], quad[1]], // Top edge
            [quad[1], quad[3]], // Right edge
            [quad[3], quad[2]], // Bottom edge
            [quad[2], quad[0]]  // Left edge
        ];
        
        for (const edge of edges) {
            const p1 = edge[0];
            const p2 = edge[1];
            
            if ((p1.y <= level && p2.y >= level) || 
                (p1.y >= level && p2.y <= level)) {
                
                // Linear interpolation to find the crossing point
                const t = (level - p1.y) / (p2.y - p1.y);
                
                crossings.push({
                    nx: p1.nx + t * (p2.nx - p1.nx),
                    ny: p1.ny + t * (p2.ny - p1.ny),
                    nz: p1.nz + t * (p2.nz - p1.nz)
                });
            }
        }
        
        // Sort crossings to form connected lines
        if (crossings.length === 4) {
            // Split into two lines for saddle points
            const d1 = Math.hypot(
                crossings[0].nx - crossings[1].nx,
                crossings[0].ny - crossings[1].ny,
                crossings[0].nz - crossings[1].nz
            );
            const d2 = Math.hypot(
                crossings[0].nx - crossings[2].nx,
                crossings[0].ny - crossings[2].ny,
                crossings[0].nz - crossings[2].nz
            );
            
            if (d1 < d2) {
                return [crossings[0], crossings[1], crossings[2], crossings[3]];
            } else {
                return [crossings[0], crossings[2], crossings[1], crossings[3]];
            }
        }
        
        return crossings;
    }

    getEnhancedColor(yValue, xCoord, zCoord, scheme) {
        // Generic coloring based primarily on Y value  
        let r, g, b, a = 0.85;
        
        switch (scheme) {
            case 'grayscale':
                r = g = b = Math.min(0.95, yValue * 1.2);
                break;
                
            case 'heatmap':
                r = Math.min(1.0, yValue * 2.5);
                g = Math.min(1.0, yValue * 1.5);
                b = Math.min(1.0, yValue * 0.5);
                break;
                
            case 'rainbow':
            default:
                // Rainbow coloring based on Y value
                const hue = (1.0 - Math.min(1.0, yValue * 1.2)) * 240; // Blue to Red
                const s = 0.8;
                const v = 0.9;
                
                const hi = Math.floor(hue / 60) % 6;
                const f = hue / 60 - Math.floor(hue / 60);
                const p = v * (1 - s);
                const q = v * (1 - f * s);
                const t = v * (1 - (1 - f) * s);
                
                if (hi === 0) { r = v; g = t; b = p; }
                else if (hi === 1) { r = q; g = v; b = p; }
                else if (hi === 2) { r = p; g = v; b = t; }
                else if (hi === 3) { r = p; g = q; b = v; }
                else if (hi === 4) { r = t; g = p; b = v; }
                else { r = v; g = p; b = q; }
                
                // Add contrast enhancement
                r = Math.pow(r, 0.8);
                g = Math.pow(g, 0.8);
                b = Math.pow(b, 0.8);
                break;
        }
        
        return { r, g, b, a };
    }

    getContourColor(level, scheme) {
        switch (scheme) {
            case 'grayscale':
                return { r: 1.0, g: 1.0, b: 1.0, a: 0.7 };
                
            case 'heatmap':
                const a = Math.min(0.9, 0.5 + level * 0.25);
                return { r: 1.0, g: 1.0 - level * 0.3, b: 0.5 - level * 0.25, a };
                
            case 'rainbow':
            default:
                const hue = (1.0 - level / 2.0) * 240; // Blue to Red
                
                const hi = Math.floor(hue / 60) % 6;
                const f = hue / 60 - Math.floor(hue / 60);
                const v = 0.9;
                const s = 0.8;
                const p = v * (1 - s);
                const q = v * (1 - f * s);
                const t = v * (1 - (1 - f) * s);
                
                let r, g, b;
                if (hi === 0) { r = v; g = t; b = p; }
                else if (hi === 1) { r = q; g = v; b = p; }
                else if (hi === 2) { r = p; g = v; b = t; }
                else if (hi === 3) { r = p; g = q; b = v; }
                else if (hi === 4) { r = t; g = p; b = v; }
                else { r = v; g = p; b = q; }
                
                return { r, g, b, a: 0.9 };
        }
    }

    resizeCanvasToDisplaySize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;

        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
        }
    }

    createPerspectiveMatrix() {
        const fov = 45 * Math.PI / 180;
        const aspect = this.canvas.width / this.canvas.height;
        const near = 0.1;
        const far = 100;
        
        const f = 1.0 / Math.tan(fov / 2);
        const nf = 1 / (near - far);
        
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, (2 * far * near) * nf, 0
        ]);
    }

    createModelViewMatrix() {
        const matrix = new Float32Array(16);
        matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
        
        const translateZ = -4.0 / this.zoom;
        matrix[14] = translateZ;
        
        const radX = this.rotationX * Math.PI / 180;
        const radY = this.rotationY * Math.PI / 180;
        
        const cosX = Math.cos(radX), sinX = Math.sin(radX);
        const cosY = Math.cos(radY), sinY = Math.sin(radY);
        
        return new Float32Array([
            cosY, 0, sinY, 0,
            sinX * sinY, cosX, -sinX * cosY, 0,
            -cosX * sinY, sinX, cosX * cosY, 0,
            0, 0, translateZ, 1
        ]);
    }

    /**
     * Normalize Y coordinate to a range suitable for visualization
     * @param {number} y - Original Y value
     * @param {Object} dataRange - The data range object containing y min/max
     * @returns {number} - Normalized Y coordinate
     */
    normalizeYCoordinate(y, dataRange) {
        // Map Y values to a reasonable range for 3D visualization
        // Typically we want Y values to be scaled appropriately for viewing
        const yRange = dataRange.y.max - dataRange.y.min;
        
        if (yRange === 0) {
            // Handle edge case where all Y values are the same
            return 0;
        }
        
        // Normalize to [0, 1] then scale to a reasonable visual range
        const normalizedY = (y - dataRange.y.min) / yRange;
        
        // Scale to make the visualization more prominent
        // Use a base height that adapts to the data range
        const visualScale = Math.min(2.0, Math.max(0.5, yRange));
        return normalizedY * visualScale;
    }

    /**
     * Convert normalized Y coordinate back to original value (inverse transformation)
     * @param {number} ny - Normalized Y coordinate  
     * @param {Object} dataRange - The data range object containing y min/max
     * @returns {number} - Original Y value
     */
    denormalizeYCoordinate(ny, dataRange) {
        const yRange = dataRange.y.max - dataRange.y.min;
        
        if (yRange === 0) {
            return dataRange.y.min;
        }
        
        // Reverse the normalization process
        const visualScale = Math.min(2.0, Math.max(0.5, yRange));
        const normalizedY = ny / visualScale;
        return normalizedY * yRange + dataRange.y.min;
    }

    clearCanvas() {
        // Clear the canvas with the background color
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    destroy() {
        // Clean up event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
        
        // Clean up WebGL resources
        if (this.gl && this.buffers) {
            if (this.buffers.position) this.gl.deleteBuffer(this.buffers.position);
            if (this.buffers.color) this.gl.deleteBuffer(this.buffers.color);
            if (this.buffers.pointSize) this.gl.deleteBuffer(this.buffers.pointSize);
            if (this.buffers.indices) this.gl.deleteBuffer(this.buffers.indices);
            if (this.buffers.linePosition) this.gl.deleteBuffer(this.buffers.linePosition);
            if (this.buffers.lineColor) this.gl.deleteBuffer(this.buffers.lineColor);
        }

        if (this.gl) {
            if (this.shaderProgram) this.gl.deleteProgram(this.shaderProgram);
            if (this.lineShaderProgram) this.gl.deleteProgram(this.lineShaderProgram);
        }

        this.buffers = null;
        this.shaderProgram = null;
        this.lineShaderProgram = null;
        this.gl = null;
        this.canvas = null;
        
        EngineLogger.info('VisualizationEngine destroyed and cleaned up');
    }
}
