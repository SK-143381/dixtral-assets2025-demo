// AxesController.js - Manages 3D axes lines and labels that rotate with the plot
// Logger will be injected by UIController

export class AxesController {
    constructor(visualizationEngine, plotData) {
        this.engine = visualizationEngine;
        this.plotData = plotData;
        this.gl = null;
        this.enabled = true;
        this.axesBuffers = null;
        this.labelElements = [];
        this.initialized = false;
        this.logger = null; // Will be injected by UIController
    }
    
    setDependencies({ logger }) {
        this.logger = logger;
    }

    async initialize() {
        this.logger?.info('AxesController: Starting initialization...');
        
        if (!this.engine || !this.engine.gl) {
            this.logger?.warn('AxesController: VisualizationEngine not ready');
            this.logger?.debug('Engine:', this.engine);
            this.logger?.debug('GL:', this.engine ? this.engine.gl : 'engine null');
            return false;
        }

        this.gl = this.engine.gl;
        this.logger?.debug('AxesController: WebGL context acquired');
        
        this.createAxesBuffers();
        this.logger?.debug('AxesController: About to create axis labels...');
        this.createAxisLabels();
        this.logger?.debug('AxesController: Axis labels creation completed');
        this.initialized = true;
        
        this.logger?.info('AxesController initialized successfully');
        this.logger?.debug('Axes enabled:', this.enabled);
        this.logger?.debug('Axes buffers:', this.axesBuffers);
        this.logger?.debug('Label elements created:', this.labelElements.length);
        return true;
    }

    createAxisLabels() {
        console.log('AxesController: createAxisLabels() called');
        
        // Create HTML overlay labels for the axes
        this.removeLabelElements();

        const sampleInfo = this.plotData.getSampleInfo();
        const labels = sampleInfo.labels;
        const units = sampleInfo.units;
        
        console.log('Sample info:', sampleInfo);

        // Create label container if it doesn't exist
        let labelContainer = document.getElementById('axes-labels');
        console.log('Existing label container:', labelContainer);
        
        if (!labelContainer) {
            console.log('Creating new label container...');
            labelContainer = document.createElement('div');
            labelContainer.id = 'axes-labels';
            labelContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                pointer-events: none;
                z-index: 1000;
                font-family: Arial, sans-serif;
                font-size: 14px;
                font-weight: bold;
                color: white;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            `;
            document.body.appendChild(labelContainer);
            console.log('Label container created and appended to body');
        }

        // Create axis labels with variable names and units
        const axesConfig = [
            {
                id: 'x-axis-label',
                text: `X: ${labels.x}${units.x ? ` (${units.x})` : ''}`,
                axis: 'x',
                ariaLabel: `X axis represents ${labels.x}${units.x ? ` in ${units.x}` : ''}`
            },
            {
                id: 'y-axis-label', 
                text: `Y: ${labels.y}${units.y ? ` (${units.y})` : ''}`,
                axis: 'y',
                ariaLabel: `Y axis represents ${labels.y}${units.y ? ` in ${units.y}` : ''}`
            },
            {
                id: 'z-axis-label',
                text: `Z: ${labels.z}${units.z ? ` (${units.z})` : ''}`,
                axis: 'z',
                ariaLabel: `Z axis represents ${labels.z}${units.z ? ` in ${units.z}` : ''}`
            }
        ];

        console.log('Creating', axesConfig.length, 'axis labels...');
        
        axesConfig.forEach((config, index) => {
            console.log(`Creating label ${index + 1}:`, config);
            
            const label = document.createElement('div');
            label.id = config.id;
            label.textContent = config.text;
            label.setAttribute('aria-label', config.ariaLabel);
            label.setAttribute('role', 'img');
            label.dataset.axis = config.axis;
            label.style.cssText = `
                position: absolute;
                padding: 2px 6px;
                background: rgba(0,0,0,0.8);
                border: 1px solid white;
                border-radius: 3px;
                white-space: nowrap;
                font-size: 12px;
                font-weight: bold;
                color: white;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.9);
                transform: translate(-50%, -50%);
            `;

            // Position will be set dynamically by updateLabelPositions
            label.style.display = 'block';
            label.style.visibility = 'visible';

            labelContainer.appendChild(label);
            this.labelElements.push(label);
            
            console.log(`Label ${config.axis} created, will be positioned at axis endpoint`);
        });

        console.log('AxesController: Created axis labels with variable names');
        console.log('Labels created:', this.labelElements.length);
        console.log('Label container:', labelContainer);
    }

    createAxesBuffers() {
        if (!this.gl) return;

        const positions = [];
        const colors = [];

        // Create simple perpendicular X, Y, Z axes from origin
        // Each axis extends 2.0 units in both directions from center (0,0,0) to reach label positions
        const axisLength = 2.0;

        // Use fixed white color for axes
        const axisColor = [1.0, 1.0, 1.0, 1.0]; // White axes

        // X-axis: extends horizontally
        positions.push(
            -axisLength, 0, 0,  // Start point (left)
             axisLength, 0, 0   // End point (right)
        );
        colors.push(...axisColor, ...axisColor);

        // Y-axis: extends vertically 
        positions.push(
            0, -axisLength, 0,  // Start point (down)
            0,  axisLength, 0   // End point (up)
        );
        colors.push(...axisColor, ...axisColor);

        // Z-axis: extends in depth
        positions.push(
            0, 0, -axisLength,  // Start point (back)
            0, 0,  axisLength   // End point (front)
        );
        colors.push(...axisColor, ...axisColor);

        // Create WebGL buffers
        this.axesBuffers = {
            position: this.gl.createBuffer(),
            color: this.gl.createBuffer(),
            vertexCount: positions.length / 3
        };

        // Upload position data
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.axesBuffers.position);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        // Upload color data  
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.axesBuffers.color);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);

        console.log('3D Coordinate axes created:', this.axesBuffers.vertexCount, 'vertices');
    }

    render(projectionMatrix, modelViewMatrix) {
        if (!this.enabled) {
            console.log('AxesController: Disabled, not rendering');
            return;
        }
        
        if (!this.initialized) {
            console.log('AxesController: Not initialized, not rendering');
            return;
        }
        
        if (!this.axesBuffers) {
            console.log('AxesController: No buffers, not rendering');
            return;
        }
        
        if (!this.engine.lineShaderProgram) {
            console.log('AxesController: No line shader program, not rendering');
            return;
        }

        // Rendering axes...

        const gl = this.gl;
        const program = this.engine.lineShaderProgram;

        // Use line shader program
        gl.useProgram(program);

        // Set uniforms
        gl.uniformMatrix4fv(program.projectionMatrixUniform, false, projectionMatrix);
        gl.uniformMatrix4fv(program.modelViewMatrixUniform, false, modelViewMatrix);

        // Bind position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.axesBuffers.position);
        gl.enableVertexAttribArray(program.vertexPositionAttribute);
        gl.vertexAttribPointer(program.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

        // Bind color buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.axesBuffers.color);
        gl.enableVertexAttribArray(program.vertexColorAttribute);
        gl.vertexAttribPointer(program.vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);

        // Set line width (note: lineWidth may not work on all systems)
        gl.lineWidth(2.0);

        // Render the axes as lines
        gl.drawArrays(gl.LINES, 0, this.axesBuffers.vertexCount);

        // Clean up
        gl.disableVertexAttribArray(program.vertexPositionAttribute);
        gl.disableVertexAttribArray(program.vertexColorAttribute);
        
        // Update label positions after rendering
        this.updateLabelPositions(projectionMatrix, modelViewMatrix);
        
        // Rendered axes successfully
    }

    updateLabels() {
        // Simple coordinate axes don't need to change when data changes
        // They provide a fixed reference frame
        if (!this.initialized) return;
        console.log('Coordinate axes remain fixed as reference frame');
    }

    toggle() {
        this.enabled = !this.enabled;
        
        // Toggle label visibility
        const labelContainer = document.getElementById('axes-labels');
        if (labelContainer) {
            labelContainer.style.display = this.enabled ? 'block' : 'none';
        }
        
        console.log('3D Axes display:', this.enabled ? 'enabled' : 'disabled');
        return this.enabled;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        
        // Update label visibility
        const labelContainer = document.getElementById('axes-labels');
        if (labelContainer) {
            labelContainer.style.display = this.enabled ? 'block' : 'none';
        }
    }

    removeLabelElements() {
        // Clean up existing label elements
        this.labelElements.forEach(element => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        this.labelElements = [];

        // Remove the entire container if it exists
        const labelContainer = document.getElementById('axes-labels');
        if (labelContainer) {
            labelContainer.innerHTML = '';
        }
    }

    destroy() {
        // Clean up WebGL resources
        if (this.axesBuffers && this.gl) {
            if (this.axesBuffers.position) {
                this.gl.deleteBuffer(this.axesBuffers.position);
            }
            if (this.axesBuffers.color) {
                this.gl.deleteBuffer(this.axesBuffers.color);
            }
        }

        // Remove label elements
        this.removeLabelElements();

        this.axesBuffers = null;
        this.initialized = false;
        
        console.log('AxesController destroyed');
    }

    updateLabelPositions(projectionMatrix, modelViewMatrix) {
        if (!this.engine || !this.engine.canvas) return;

        const canvas = this.engine.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        
        console.log('Updating label positions...');
        console.log('Canvas rect:', canvasRect);

        // Define axis endpoints in 3D space (matching our axes)
        const axisLength = 2.0; // Updated to match the extended axes
        const axisEndpoints = {
            x: [axisLength, 0, 0],     // End of X axis
            y: [0, axisLength, 0],     // End of Y axis  
            z: [0, 0, axisLength]      // End of Z axis
        };

        // Define constraint boundaries - keep labels within the canvas area
        const labelPadding = 20; // Padding from canvas edges to ensure labels are fully visible
        const constraintBounds = {
            left: canvasRect.left + labelPadding,
            right: canvasRect.right - labelPadding,
            top: canvasRect.top + labelPadding,
            bottom: canvasRect.bottom - labelPadding
        };

        // Project 3D coordinates to screen space
        Object.keys(axisEndpoints).forEach(axis => {
            const [x, y, z] = axisEndpoints[axis];
            const screenPos = this.project3DToScreen(x, y, z, projectionMatrix, modelViewMatrix, canvas);
            
            if (screenPos) {
                const label = document.getElementById(`${axis}-axis-label`);
                console.log(`${axis} axis - Screen position:`, screenPos, 'Label element:', label);
                
                if (label) {
                    // Add offset to position labels slightly away from axis endpoints
                    const offset = 20;
                    let finalX = canvasRect.left + screenPos.x;
                    let finalY = canvasRect.top + screenPos.y;
                    
                    // Position labels at the end of each axis with appropriate offsets
                    if (axis === 'x') {
                        finalX += offset; // Right of X-axis endpoint
                    } else if (axis === 'y') {
                        finalY -= offset; // Above Y-axis endpoint
                    } else if (axis === 'z') {
                        finalX -= offset; // Left of Z-axis endpoint
                    }
                    
                    // Constrain labels to stay within the canvas bounds
                    finalX = Math.max(constraintBounds.left, Math.min(constraintBounds.right, finalX));
                    finalY = Math.max(constraintBounds.top, Math.min(constraintBounds.bottom, finalY));
                    
                    // Check if the original projected position would be outside canvas
                    const originalX = canvasRect.left + screenPos.x;
                    const originalY = canvasRect.top + screenPos.y;
                    const isOutsideCanvas = originalX < canvasRect.left || 
                                           originalX > canvasRect.right || 
                                           originalY < canvasRect.top || 
                                           originalY > canvasRect.bottom;
                    
                    if (isOutsideCanvas) {
                        // Hide labels when the axis extends outside the visible canvas area
                        label.style.display = 'none';
                        console.log(`${axis} label hidden - axis extends outside canvas area`);
                    } else {
                        label.style.left = finalX + 'px';
                        label.style.top = finalY + 'px';
                        label.style.display = 'block';
                        label.style.visibility = 'visible';
                        
                        console.log(`${axis} label positioned within canvas: (${finalX}, ${finalY})`);
                    }
                } else {
                    console.log(`${axis} label element not found!`);
                }
            } else {
                console.log(`${axis} axis - no valid screen position`);
            }
        });
    }

    project3DToScreen(x, y, z, projectionMatrix, modelViewMatrix, canvas) {
        // Create 4D vector [x, y, z, 1]
        const point = [x, y, z, 1];
        
        // Apply model-view transformation
        const mvTransformed = this.multiplyMatrixVector(modelViewMatrix, point);
        
        // Apply projection transformation
        const projected = this.multiplyMatrixVector(projectionMatrix, mvTransformed);
        
        // Perform perspective divide
        if (projected[3] === 0) return null;
        
        const ndcX = projected[0] / projected[3];
        const ndcY = projected[1] / projected[3];
        const ndcZ = projected[2] / projected[3];
        
        // Check if point is behind camera
        if (ndcZ > 1 || ndcZ < -1) return null;
        
        // Convert to screen coordinates
        const screenX = (ndcX + 1) * 0.5 * canvas.width;
        const screenY = (1 - ndcY) * 0.5 * canvas.height;
        
        return { x: screenX, y: screenY };
    }

    multiplyMatrixVector(matrix, vector) {
        // Matrix is in column-major order (OpenGL format)
        const result = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                result[i] += matrix[j * 4 + i] * vector[j]; // Column-major indexing
            }
        }
        return result;
    }

    updateLabels() {
        // Update label text when data changes
        if (!this.initialized) return;
        
        this.createAxisLabels(); // Recreate labels with new data
    }

    // Method to refresh axes when data changes
    refresh() {
        if (!this.initialized) return;
        
        this.createAxisLabels(); // Refresh labels with new variable names
        console.log('Coordinate axes labels refreshed for new data');
    }


} 