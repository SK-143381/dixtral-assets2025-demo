// UIController.js - UI interaction and update management
import { AxesController } from './AxesController.js';
import { DarkModeController } from './DarkModeController.js';
import { MenuController } from './MenuController.js';
import { EVENTS } from '../constants/EventConstants.js';
import { UILogger } from '../utils/Logger.js';

export class UIController {
    constructor(visualizationEngine, plotData) {
        this.engine = visualizationEngine;
        this.data = plotData;
        this.controls = {};
        this.initialized = false; // Add initialization flag
        this.eventListeners = new Map(); // Track event listeners for cleanup
        this.destroyed = false; // Track destruction state for retry termination
        
        // Initialize UI sub-components
        this.axesController = null;
        this.darkModeController = null;
        this.menuController = null;
    }

    async initialize() {
        if (this.initialized) {
            UILogger.warn('UIController already initialized, skipping...');
            return;
        }

        UILogger.info('UIController initialized');
        try {
            // Initialize controls first
            this.initializeControls();
            this.setupTTSToggle();
            this.setupNavigationAxisToggle();

            // Initialize axes controller
            this.axesController = new AxesController(this.engine, this.data);
            this.axesController.setDependencies({ logger: UILogger });
            await this.axesController.initialize();

            // Initialize dark mode controller
            this.darkModeController = new DarkModeController();
            this.darkModeController.setDependencies({ logger: UILogger });

            // Initialize menu controller
            this.menuController = new MenuController();
            this.menuController.setDependencies({ logger: UILogger });
            await this.menuController.initialize();

            // Initialize review text field
            this.initializeReviewTextField();

            // Listen for data label changes to update UI components
            const dataLabelsChangedHandler = () => {
                if (this.initialized && this.axesController) {
                    UILogger.debug('UIController: Data labels changed, refreshing axes');
                    this.axesController.refresh();
                }
            };
            document.addEventListener(EVENTS.DATA_LABELS_CHANGED, dataLabelsChangedHandler);
            this.eventListeners.set('data-labels-changed', { element: document, event: EVENTS.DATA_LABELS_CHANGED, handler: dataLabelsChangedHandler });

            // Listen for review mode events
            const reviewModeEnteredHandler = () => {
                this.showReviewTextField();
            };
            document.addEventListener(EVENTS.REVIEW_MODE_ENTERED, reviewModeEnteredHandler);
            this.eventListeners.set('review-mode-entered', { element: document, event: EVENTS.REVIEW_MODE_ENTERED, handler: reviewModeEnteredHandler });

            const reviewModeExitedHandler = () => {
                this.hideReviewTextField();
            };
            document.addEventListener(EVENTS.REVIEW_MODE_EXITED, reviewModeExitedHandler);
            this.eventListeners.set('review-mode-exited', { element: document, event: EVENTS.REVIEW_MODE_EXITED, handler: reviewModeExitedHandler });

            const reviewModeTextUpdatedHandler = (event) => {
                this.updateReviewTextFieldContent(event.detail.text);
            };
            document.addEventListener(EVENTS.REVIEW_MODE_TEXT_UPDATED, reviewModeTextUpdatedHandler);
            this.eventListeners.set('review-mode-text-updated', { element: document, event: EVENTS.REVIEW_MODE_TEXT_UPDATED, handler: reviewModeTextUpdatedHandler });

            this.initialized = true;
            UILogger.info('UIController: All UI sub-components initialized successfully');
        } catch (error) {
            UILogger.error('Failed to initialize UIController:', error);
            throw error;
        }
    }

    initializeControls() {
        // Initialize control references with defensive checks
        this.controls = {
            xStart: document.getElementById('xStart'),
            xEnd: document.getElementById('xEnd'),
            zStart: document.getElementById('zStart'),
            zEnd: document.getElementById('zEnd'),
            displayMode: document.getElementById('displayMode'),
            colorScheme: document.getElementById('colorScheme'),
            pointSize: document.getElementById('pointSize'),
            threshold: document.getElementById('threshold'),
            rotationX: document.getElementById('rotationX'),
            rotationY: document.getElementById('rotationY'),
            zoom: document.getElementById('zoom')
        };
        
        // Backward compatibility aliases
        this.controls.waveStart = this.controls.xStart;
        this.controls.waveEnd = this.controls.xEnd;
        this.controls.timeStart = this.controls.zStart;
        this.controls.timeEnd = this.controls.zEnd;

        // Setup buttons (optional elements)
        this.resetViewButton = document.getElementById('resetView');
        this.exportDataButton = document.getElementById('exportData');
        this.exportImageButton = document.getElementById('exportImage');
        this.importDataButton = document.getElementById('importData');
        
        // Sample data buttons (optional elements)
        this.loadBenzeneButton = document.getElementById('loadBenzene');
        this.loadSinusoidalButton = document.getElementById('loadSinusoidal');
        this.loadCustomDataButton = document.getElementById('loadCustomData');
        
        // Variable selection (optional elements)
        this.variableSelection = document.getElementById('variableSelection');
        this.xVariable = document.getElementById('xVariable');
        this.yVariable = document.getElementById('yVariable');
        this.zVariable = document.getElementById('zVariable');
        
        // Analysis buttons (optional elements)
        this.findPeaksButton = document.getElementById('findPeaks');
        this.baselineCorrectionButton = document.getElementById('baselineCorrection');
        this.spectralDeconvolutionButton = document.getElementById('spectralDeconvolution');

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Clean up existing listeners first
        this.cleanupEventListeners();

        // Setup event listeners for all controls
        Object.entries(this.controls).forEach(([key, element]) => {
            if (element) {
                const handler = () => this.updateVisualization();
                element.addEventListener('input', handler);
                this.eventListeners.set(`control-${key}`, { element, event: 'input', handler });
            }
        });

        // Button event listeners - Following architecture: UI layer dispatches events to Application layer
        if (this.resetViewButton) {
            const handler = () => this.resetView();
            this.resetViewButton.addEventListener('click', handler);
            this.eventListeners.set('resetView', { element: this.resetViewButton, event: 'click', handler });
        }

        if (this.exportDataButton) {
            const handler = () => {
                // UI layer dispatches event to Application layer (following architecture)
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_EXPORT_DATA));
            };
            this.exportDataButton.addEventListener('click', handler);
            this.eventListeners.set('exportData', { element: this.exportDataButton, event: 'click', handler });
        }

        if (this.exportImageButton) {
            const handler = () => {
                // UI layer dispatches event to Application layer (following architecture)
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_EXPORT_IMAGE));
            };
            this.exportImageButton.addEventListener('click', handler);
            this.eventListeners.set('exportImage', { element: this.exportImageButton, event: 'click', handler });
        }

        if (this.importDataButton) {
            const handler = () => {
                // UI layer dispatches event to Application layer (following architecture)
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_IMPORT_DATA));
            };
            this.importDataButton.addEventListener('click', handler);
            this.eventListeners.set('importData', { element: this.importDataButton, event: 'click', handler });
        }

        // Sample data buttons
        if (this.loadBenzeneButton) {
            const handler = () => {
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_LOAD_SAMPLE, { detail: { sample: 'benzene' } }));
            };
            this.loadBenzeneButton.addEventListener('click', handler);
            this.eventListeners.set('loadBenzene', { element: this.loadBenzeneButton, event: 'click', handler });
        }
        
        if (this.loadSinusoidalButton) {
            const handler = () => {
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_LOAD_SAMPLE, { detail: { sample: 'sinusoidal' } }));
            };
            this.loadSinusoidalButton.addEventListener('click', handler);
            this.eventListeners.set('loadSinusoidal', { element: this.loadSinusoidalButton, event: 'click', handler });
        }
        
        // Analysis button event listeners
        if (this.findPeaksButton) {
            const handler = () => {
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_FIND_PEAKS));
            };
            this.findPeaksButton.addEventListener('click', handler);
            this.eventListeners.set('findPeaks', { element: this.findPeaksButton, event: 'click', handler });
        }
        
        if (this.baselineCorrectionButton) {
            const handler = () => {
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_BASELINE_CORRECTION));
            };
            this.baselineCorrectionButton.addEventListener('click', handler);
            this.eventListeners.set('baselineCorrection', { element: this.baselineCorrectionButton, event: 'click', handler });
        }
        
        if (this.spectralDeconvolutionButton) {
            const handler = () => {
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_SPECTRAL_DECONVOLUTION));
            };
            this.spectralDeconvolutionButton.addEventListener('click', handler);
            this.eventListeners.set('spectralDeconvolution', { element: this.spectralDeconvolutionButton, event: 'click', handler });
        }

        // Special handling for display mode changes
        if (this.controls.displayMode) {
            const handler = () => {
                const newDisplayMode = this.controls.displayMode.value;
                this.engine.currentDisplayMode = newDisplayMode;
                
                // Notify navigation controller about display mode change via event system
                document.dispatchEvent(new CustomEvent(EVENTS.DISPLAY_MODE_CHANGED, {
                    detail: { displayMode: newDisplayMode }
                }));
                
                this.engine.createBuffers();
                this.updateVisualization();
            };
            this.controls.displayMode.addEventListener('change', handler);
            this.eventListeners.set('displayMode', { element: this.controls.displayMode, event: 'change', handler });
        }

        // Setup keyboard shortcuts
        const keyboardHandler = (event) => this.handleKeyboardShortcuts(event);
        document.addEventListener('keydown', keyboardHandler);
        this.eventListeners.set('keyboard-shortcuts', { element: document, event: 'keydown', handler: keyboardHandler });

        // Custom data loading - Following architecture: UI dispatches to Application layer
        if (this.loadCustomDataButton) {
            const handler = () => {
                document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_LOAD_CUSTOM_DATA));
            };
            this.loadCustomDataButton.addEventListener('click', handler);
            this.eventListeners.set('loadCustomData', { element: this.loadCustomDataButton, event: 'click', handler });
        }

        // Variable selection change handlers
        if (this.xVariable) {
            const handler = () => this.updateVariableSelection();
            this.xVariable.addEventListener('change', handler);
            this.eventListeners.set('xVariable', { element: this.xVariable, event: 'change', handler });
        }
        if (this.yVariable) {
            const handler = () => this.updateVariableSelection();
            this.yVariable.addEventListener('change', handler);
            this.eventListeners.set('yVariable', { element: this.yVariable, event: 'change', handler });
        }
        if (this.zVariable) {
            const handler = () => this.updateVariableSelection();
            this.zVariable.addEventListener('change', handler);
            this.eventListeners.set('zVariable', { element: this.zVariable, event: 'change', handler });
        }
    }

    handleKeyboardShortcuts(event) {
        switch(event.key) {
            case '1':
                this.setDisplayMode('surface');
                break;
            case '2':
                this.setDisplayMode('points');
                break;
            case 'r':
            case 'R':
                this.resetView();
                break;
            case ' ':
                event.preventDefault();
                this.resetView();
                break;
            case 'a':
            case 'A':
                // Toggle axes display
                if (this.axesController) {
                    this.axesController.toggle();
                }
                break;
        }
    }

    updateVisualization() {
        // Update engine parameters
        this.engine.rotationX = parseFloat(this.controls.rotationX.value);
        this.engine.rotationY = parseFloat(this.controls.rotationY.value);
        this.engine.zoom = parseFloat(this.controls.zoom.value);
        
        // Check if display mode changed
        const newDisplayMode = this.controls.displayMode.value;
        if (newDisplayMode !== this.engine.currentDisplayMode) {
            this.engine.currentDisplayMode = newDisplayMode;
            this.engine.createBuffers();
            
            // Update navigation axis toggle visibility based on display mode
            setTimeout(() => {
                this.setupNavigationAxisToggle();
            }, 10);
        } else {
            this.engine.createBuffers();
        }
        
        // Force an immediate render after updating visualization
        this.engine.render(this.data);
    }

    updateDisplayValues() {
        // Update all display values
        document.getElementById('xStartValue').textContent = this.controls.xStart.value;
        document.getElementById('xEndValue').textContent = this.controls.xEnd.value;
        document.getElementById('zStartValue').textContent = parseFloat(this.controls.zStart.value).toFixed(1);
        document.getElementById('zEndValue').textContent = parseFloat(this.controls.zEnd.value).toFixed(1);
        // Map point size: 1 -> 6px, 10 -> 10px, linear in between
        const sliderVal = parseInt(this.controls.pointSize.value, 10);
        const pxSize = sliderVal === 1 ? 6 : 6 + (sliderVal - 1) * (4 / 9);
        document.getElementById('pointSizeValue').textContent = pxSize.toFixed(1);
        document.getElementById('thresholdValue').textContent = parseFloat(this.controls.threshold.value).toFixed(2);
        document.getElementById('rotationXValue').textContent = this.controls.rotationX.value + '°';
        document.getElementById('rotationYValue').textContent = this.controls.rotationY.value + '°';
        document.getElementById('zoomValue').textContent = parseFloat(this.controls.zoom.value).toFixed(1) + 'x';
    }

    setDisplayMode(mode) {
        UILogger.debug('Setting display mode to:', mode);
        this.controls.displayMode.value = mode;
        // Trigger the change event
        const event = new Event('change');
        this.controls.displayMode.dispatchEvent(event);
        
        // Request announcement of the display mode change via event system
        // This follows the architectural pattern of event-driven cross-layer communication
        document.dispatchEvent(new CustomEvent(EVENTS.DISPLAY_MODE_ANNOUNCEMENT_REQUESTED, {
            detail: { displayMode: mode }
        }));
    }

    resetView() {
        // Set camera to view X-Y plane from the front (Z axis not visible)
        this.controls.rotationX.value = 0;  // No up/down rotation
        this.controls.rotationY.value = 0;  // No left/right rotation
        this.controls.zoom.value = 1;
        this.updateVisualization();
    }

    updatePerformanceMetrics(fps, pointCount) {
        document.getElementById('fps').textContent = fps;
        document.getElementById('pointCount').textContent = pointCount;
        
        // Update FPS color coding
        const fpsElement = document.getElementById('fps');
        if (fps < 20) {
            fpsElement.style.color = '#ff6b6b';
        } else if (fps < 40) {
            fpsElement.style.color = '#ffd93d';
        } else {
            fpsElement.style.color = '#6bcf7f';
        }
    }

    updateRangeControls() {
        // Get current data ranges
        const dataRange = this.data.getDataRange();
        if (!dataRange) return;
        
        // Update X range controls
        if (this.controls.xStart && this.controls.xEnd) {
            this.controls.xStart.min = dataRange.x.min;
            this.controls.xStart.max = dataRange.x.max;
            this.controls.xStart.value = dataRange.x.min;
            
            this.controls.xEnd.min = dataRange.x.min;
            this.controls.xEnd.max = dataRange.x.max;
            this.controls.xEnd.value = dataRange.x.max;
        }
        
        // Update Z range controls
        if (this.controls.zStart && this.controls.zEnd) {
            this.controls.zStart.min = dataRange.z.min;
            this.controls.zStart.max = dataRange.z.max;
            this.controls.zStart.value = dataRange.z.min;
            this.controls.zStart.step = (dataRange.z.max - dataRange.z.min) / 100;
            
            this.controls.zEnd.min = dataRange.z.min;
            this.controls.zEnd.max = dataRange.z.max;
            this.controls.zEnd.value = dataRange.z.max;
            this.controls.zEnd.step = (dataRange.z.max - dataRange.z.min) / 100;
        }
        
        // Update Y threshold control
        if (this.controls.threshold) {
            this.controls.threshold.min = dataRange.y.min;
            this.controls.threshold.max = dataRange.y.max;
            this.controls.threshold.value = dataRange.y.min;
            this.controls.threshold.step = (dataRange.y.max - dataRange.y.min) / 100;
        }
        
        // Update display values to reflect new ranges
        this.updateDisplayValues();
        
        // Update axes when data changes
        if (this.axesController) {
            this.axesController.updateLabels();
        }
        
        UILogger.debug('Updated UI controls for data ranges:', dataRange);
    }

    setupTTSToggle() {
        // Wait for the next frame to ensure navigation info is initialized
        requestAnimationFrame(() => {
            const navInfoElement = document.getElementById('navigationInfo');
            if (!navInfoElement) return;

            // Check if toggle already exists
            const existingToggle = document.getElementById('ttsToggle');
            if (existingToggle) {
                // If it exists but is not in the navigation info element, move it there
                if (existingToggle.parentNode !== navInfoElement) {
                    navInfoElement.appendChild(existingToggle);
                }
                return;
            }

            const toggleButton = document.createElement('button');
            toggleButton.id = 'ttsToggle';
            toggleButton.className = 'nav-toggle-button';
            toggleButton.setAttribute('role', 'switch');
            toggleButton.setAttribute('aria-checked', 'false');
            toggleButton.textContent = 'Built-in TTS Off';
            
            toggleButton.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent(EVENTS.TTS_TOGGLE_REQUESTED));
            });

            // Add the toggle to the navigation info
            navInfoElement.appendChild(toggleButton);

            // Listen for TTS state changes
            document.addEventListener(EVENTS.TTS_STATE_CHANGED, (event) => {
                const isEnabled = event.detail.isEnabled;
                toggleButton.textContent = isEnabled ? 'Built-in TTS On' : 'Built-in TTS Off';
                toggleButton.setAttribute('aria-checked', isEnabled.toString());
            });
        });
    }

    setupNavigationAxisToggle(retryCount = 0) {
        const maxRetries = 50; // Maximum 5 seconds of retries (50 * 100ms)
        
        // Check if controller has been destroyed - terminate retries
        if (this.destroyed) {
            UILogger.debug('UIController: setupNavigationAxisToggle() terminated - controller destroyed');
            return;
        }
        
        // Wait for the next frame to ensure navigation info is initialized
        requestAnimationFrame(() => {
            // Check again after requestAnimationFrame in case of destruction during wait
            if (this.destroyed) {
                UILogger.debug('UIController: setupNavigationAxisToggle() terminated after requestAnimationFrame - controller destroyed');
                return;
            }
            
            const navInfoElement = document.getElementById('navigationInfo');
            if (!navInfoElement) {
                // Check if we've exceeded maximum retries
                if (retryCount >= maxRetries) {
                    UILogger.warn('UIController: setupNavigationAxisToggle() exceeded maximum retries. Navigation axis toggle will not be available.');
                    return;
                }
                
                // Try again after a short delay if navigation info isn't ready
                setTimeout(() => this.setupNavigationAxisToggle(retryCount + 1), 100);
                return;
            }

            // Check if we're in point mode (not wireframe mode)
            const displayMode = document.getElementById('displayMode')?.value;
            if (displayMode === 'surface') {
                // Hide the toggle in wireframe/surface mode
                const existingToggle = document.getElementById('navigationAxisToggle');
                if (existingToggle) {
                    existingToggle.remove();
                }
                return;
            }

            // Check if toggle already exists and is in the right place
            const existingToggle = document.getElementById('navigationAxisToggle');
            if (existingToggle && existingToggle.parentNode === navInfoElement) {
                // Toggle already exists and is in the right place
                return;
            }

            // Remove existing toggle if it's somewhere else
            if (existingToggle) {
                existingToggle.remove();
            }

            const toggleButton = document.createElement('button');
            toggleButton.id = 'navigationAxisToggle';
            toggleButton.className = 'nav-toggle-button';
            toggleButton.setAttribute('role', 'switch');
            toggleButton.setAttribute('aria-checked', 'true'); // Default is now Y-axis
            toggleButton.textContent = 'Navigate: Y-Axis';
            
            toggleButton.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent(EVENTS.NAVIGATION_AXIS_TOGGLE_REQUESTED));
            });

            // Add the toggle to the navigation info (before TTS toggle if it exists)
            const ttsToggle = document.getElementById('ttsToggle');
            if (ttsToggle) {
                navInfoElement.insertBefore(toggleButton, ttsToggle);
            } else {
                navInfoElement.appendChild(toggleButton);
            }

            // Clean up any existing axis change listeners for this button
            this.eventListeners.delete('navigation-axis-changed');

            // Listen for navigation axis changes
            const axisChangeHandler = (event) => {
                const axis = event.detail.axis;
                let axisLabel;
                if (axis === 'z') {
                    axisLabel = this.data?.zLabel || 'Z';
                } else if (axis === 'x') {
                    axisLabel = this.data?.xLabel || 'X';
                } else {
                    axisLabel = this.data?.yLabel || 'Y';
                }
                toggleButton.textContent = `Navigate: ${axisLabel}-Axis`;
                toggleButton.setAttribute('aria-checked', (axis === 'z').toString());
            };
            
            document.addEventListener(EVENTS.NAVIGATION_AXIS_CHANGED, axisChangeHandler);
            this.eventListeners.set('navigation-axis-changed', {
                element: document,
                event: EVENTS.NAVIGATION_AXIS_CHANGED,
                handler: axisChangeHandler
            });
        });
    }

    // Method for VisualizationEngine to call when rendering
    renderAxes(projectionMatrix, modelViewMatrix) {
        // Rendering axes through UIController
        
        if (this.axesController && this.axesController.initialized) {
            this.axesController.render(projectionMatrix, modelViewMatrix);
        }
    }

    // Method to refresh axes when data changes
    refreshAxes() {
        if (this.axesController) {
            this.axesController.refresh();
        }
    }

    /**
     * Initialize the review text field (hidden by default)
     */
    initializeReviewTextField() {
        // Create the review text field container
        this.reviewTextFieldContainer = document.createElement('div');
        this.reviewTextFieldContainer.id = 'reviewTextFieldContainer';
        this.reviewTextFieldContainer.className = 'review-text-field-container';
        this.reviewTextFieldContainer.style.display = 'none'; // Hidden by default
        this.reviewTextFieldContainer.setAttribute('role', 'region');
        this.reviewTextFieldContainer.setAttribute('aria-label', 'Review Mode Text Content');
        
        // Create the input element for single-line text
        this.reviewTextField = document.createElement('input');
        this.reviewTextField.type = 'text';
        this.reviewTextField.id = 'reviewTextField';
        this.reviewTextField.className = 'review-text-field';
        this.reviewTextField.setAttribute('readonly', 'readonly');
        this.reviewTextField.setAttribute('aria-label', 'Review mode: read-only text field. Use arrow keys, Home, End, and caret navigation. Press V to return to plot.');
        this.reviewTextField.setAttribute('tabindex', '0');
        
        // Ensure proper readonly behavior - allow text selection and caret navigation
        this.reviewTextField.setAttribute('aria-readonly', 'true');
        
        // Critical: Remove the HTML readonly attribute and use a custom approach
        // This allows caret navigation while preventing editing
        this.reviewTextField.removeAttribute('readonly');
        
        // Enable text selection for better accessibility
        this.reviewTextField.style.userSelect = 'text';
        this.reviewTextField.style.webkitUserSelect = 'text';
        this.reviewTextField.style.mozUserSelect = 'text';
        this.reviewTextField.style.msUserSelect = 'text';
        
        // Prevent actual editing while allowing caret navigation
        this.reviewTextField.addEventListener('input', (event) => {
            // Reset to original value if user tries to edit
            event.preventDefault();
            const originalValue = this.reviewTextField.value;
            setTimeout(() => {
                if (this.reviewTextField.value !== originalValue) {
                    this.reviewTextField.value = originalValue;
                }
            }, 0);
        });
        
        // Prevent cut/paste operations but allow copy
        this.reviewTextField.addEventListener('cut', (event) => event.preventDefault());
        this.reviewTextField.addEventListener('paste', (event) => event.preventDefault());
        
        // Allow all selection operations for accessibility
        this.reviewTextField.addEventListener('beforeinput', (event) => {
            // Prevent any input modifications but allow selection
            if (event.inputType && !event.inputType.includes('selection')) {
                event.preventDefault();
            }
        });
        
        // Add V key handler to text field for exiting review mode
        // Allow all other keys (especially arrow keys) to work normally for caret navigation
        this.reviewTextFieldKeyHandler = (event) => {
            if (event.key.toLowerCase() === 'v') {
                event.preventDefault();
                event.stopPropagation();
                // Exit review mode by dispatching the same event that NavigationController listens for
                UILogger.debug('V key pressed in text field - exiting review mode');
                // Directly trigger the toggle through a custom event that only NavigationController handles
                document.dispatchEvent(new CustomEvent('review-mode-exit-from-textfield'));
            }
            // Allow all other keys (arrow keys, home, end, etc.) to work normally for caret navigation
            // Do not prevent default for any other keys - this enables proper text field navigation
        };
        this.reviewTextField.addEventListener('keydown', this.reviewTextFieldKeyHandler);
        
        // Add focus event to ensure caret is visible when field receives focus
        this.reviewTextField.addEventListener('focus', () => {
            // Ensure caret is visible and positioned at beginning
            setTimeout(() => {
                this.reviewTextField.setSelectionRange(0, 0);
                
                // Force caret display by briefly changing and restoring selection
                const currentPos = this.reviewTextField.selectionStart;
                this.reviewTextField.setSelectionRange(this.reviewTextField.value.length, this.reviewTextField.value.length);
                setTimeout(() => {
                    this.reviewTextField.setSelectionRange(currentPos, currentPos);
                }, 10);
            }, 10);
        });
        
        // Add click handler to ensure caret positioning works
        this.reviewTextField.addEventListener('click', (event) => {
            // Allow normal click positioning
            setTimeout(() => {
                // Ensure caret is visible after click
                const pos = this.reviewTextField.selectionStart;
                this.reviewTextField.setSelectionRange(pos, pos);
            }, 10);
        });
        
        // Add instruction text
        const instructionText = document.createElement('p');
        instructionText.className = 'review-mode-instructions';
        instructionText.textContent = 'Review Mode: Use arrow keys, Home, End for caret navigation. Select text with Shift+arrows. Press V to return to plot.';
        instructionText.style.fontSize = '12px';
        instructionText.style.margin = '0 0 5px 0';
        instructionText.style.color = 'var(--text-secondary, #666666)';
        
        // Append elements
        this.reviewTextFieldContainer.appendChild(instructionText);
        this.reviewTextFieldContainer.appendChild(this.reviewTextField);
        
        // Insert above the navigation panel
        const navigationInfo = document.getElementById('navigationInfo');
        if (navigationInfo && navigationInfo.parentNode) {
            navigationInfo.parentNode.insertBefore(this.reviewTextFieldContainer, navigationInfo);
        }
        
        console.log('Review text field initialized');
    }

    /**
     * Show the review text field (focus is handled by NavigationController)
     */
    showReviewTextField() {
        if (this.reviewTextFieldContainer) {
            this.reviewTextFieldContainer.style.display = 'block';
            // Auto-resize when shown to ensure proper sizing
            this.autoResizeReviewTextField();
        }
    }

    /**
     * Hide the review text field
     */
    hideReviewTextField() {
        if (this.reviewTextFieldContainer) {
            this.reviewTextFieldContainer.style.display = 'none';
        }
    }

    /**
     * Update the content of the review text field and adjust its size
     * @param {string} text - The text content to display
     */
    updateReviewTextFieldContent(text) {
        if (this.reviewTextField) {
            this.reviewTextField.value = text;
            
            // Auto-resize the textarea based on content
            this.autoResizeReviewTextField();
        }
    }
    
    /**
     * Auto-resize the review text field based on its content
     * @private
     */
    autoResizeReviewTextField() {
        if (!this.reviewTextField) return;
        
        const text = this.reviewTextField.value || 'Sample text';
        
        // Create a temporary span to measure exact text width
        const tempSpan = document.createElement('span');
        tempSpan.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: nowrap;
            font-family: 'Courier New', Consolas, Monaco, monospace;
            font-size: 14px;
            font-weight: normal;
            letter-spacing: normal;
        `;
        tempSpan.textContent = text;
        document.body.appendChild(tempSpan);
        
        // Get the actual text width
        const textWidth = tempSpan.getBoundingClientRect().width;
        document.body.removeChild(tempSpan);
        
        // Calculate optimal width: text width + padding + border + small buffer
        const padding = 16; // 4px + 8px padding on each side
        const border = 4; // 2px border on each side
        const buffer = 20; // Small buffer for cursor and comfort
        const calculatedWidth = Math.ceil(textWidth + padding + border + buffer);
        
        // Set reasonable constraints
        const minWidth = 280;
        const maxWidth = Math.min(window.innerWidth - 80, 1200);
        const optimalWidth = Math.max(minWidth, Math.min(calculatedWidth, maxWidth));
        
        // Apply the calculated width
        this.reviewTextField.style.width = `${optimalWidth}px`;
        
        // Update container width to fit the text field
        if (this.reviewTextFieldContainer) {
            const containerPadding = 16; // 8px padding on each side
            this.reviewTextFieldContainer.style.width = `${optimalWidth + containerPadding}px`;
        }
    }

    // Cleanup method
    destroy() {
        // Set destroyed flag to terminate any pending retries
        this.destroyed = true;
        
        // Clean up event listeners
        this.cleanupEventListeners();
        
        // Clean up review text field
        if (this.reviewTextField && this.reviewTextFieldKeyHandler) {
            this.reviewTextField.removeEventListener('keydown', this.reviewTextFieldKeyHandler);
        }
        if (this.reviewTextFieldContainer && this.reviewTextFieldContainer.parentNode) {
            this.reviewTextFieldContainer.parentNode.removeChild(this.reviewTextFieldContainer);
        }
        this.reviewTextFieldContainer = null;
        this.reviewTextField = null;
        this.reviewTextFieldKeyHandler = null;
        
        // Clean up sub-controllers
        if (this.axesController) {
            this.axesController.destroy();
            this.axesController = null;
        }
        
        if (this.darkModeController) {
            this.darkModeController = null;
        }
        
        if (this.menuController) {
            this.menuController = null;
        }
        
        // Reset initialization flag
        this.initialized = false;
        
                    UILogger.info('UIController destroyed and cleaned up');
    }

    populateVariableDropdowns(headers) {
        // Clear existing options
        this.xVariable.innerHTML = '';
        this.yVariable.innerHTML = '';
        this.zVariable.innerHTML = '';

        // Add options to all dropdowns
        headers.forEach(header => {
            this.xVariable.add(new Option(header, header));
            this.yVariable.add(new Option(header, header));
            this.zVariable.add(new Option(header, header));
        });

        // Reset selections
        this.xVariable.value = '';
        this.yVariable.value = '';
        this.zVariable.value = '';
    }

    updateVariableSelection() {
        const selectedX = this.xVariable.value;
        const selectedY = this.yVariable.value;
        const selectedZ = this.zVariable.value;

        // Disable selected options in other dropdowns
        Array.from(this.xVariable.options).forEach(option => {
            option.disabled = option.value && option.value !== selectedX && 
                            (option.value === selectedY || option.value === selectedZ);
        });

        Array.from(this.yVariable.options).forEach(option => {
            option.disabled = option.value && option.value !== selectedY && 
                            (option.value === selectedX || option.value === selectedZ);
        });

        Array.from(this.zVariable.options).forEach(option => {
            option.disabled = option.value && option.value !== selectedZ && 
                            (option.value === selectedX || option.value === selectedY);
        });

        // If all variables are selected, load the data
        if (selectedX && selectedY && selectedZ) {
            this.loadCustomData(selectedX, selectedY, selectedZ);
        }
    }

    async loadCustomData(xVar, yVar, zVar) {
        try {
            // Clear info panel
            const sampleInfoElement = document.getElementById('sampleInfo');
            if (sampleInfoElement) sampleInfoElement.innerHTML = '';

            // Dispatch event to application layer to handle data loading
            document.dispatchEvent(new CustomEvent(EVENTS.LOAD_SELECTED_VARIABLES, {
                detail: { xVar, yVar, zVar }
            }));

            // Hide variable selection - the app will handle the rest
            this.variableSelection.style.display = 'none';

            // Notify app to update info panel and re-render
            document.dispatchEvent(new CustomEvent(EVENTS.CUSTOM_DATA_LOADED));

        } catch (error) {
            UILogger.error('Error loading custom data:', error);
            this.showError('Data Loading Error', 'Failed to load data: ' + error.message);
        }
    }

    showError(title, message) {
        // Dispatch error event to be handled by the application
        document.dispatchEvent(new CustomEvent(EVENTS.SURFACE_PLOT_ERROR, {
            detail: { title, message }
        }));
    }

    cleanupEventListeners() {
        // Clean up existing listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
    }
} 