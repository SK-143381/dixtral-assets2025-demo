// app.js - Main application class
import { VisualizationEngine } from './core/VisualizationEngine.js';
import { PlotData } from './core/PlotData.js';
import { UIController } from './ui/UIController.js';
import { NavigationController } from './accessibility/NavigationController.js';
import { AppLogger } from './utils/Logger.js';
import { EVENTS } from './constants/EventConstants.js';

// Global reference for access from other modules
window.surfacePlotApp = null;

export class SurfacePlotApplication {
    constructor() {
        this.canvas = null;
        this.engine = null;
        this.data = null;
        this.ui = null;
        this.navigation = null;
        this.initialized = false; // Add initialization flag
        this.eventListeners = new Map(); // Track event listeners for cleanup
        
        this.fps = 0;
        this.lastTime = 0;
        this.frameCount = 0;
        
        // Custom data loading state
        this.pendingFileContent = null;
        this.pendingFileType = null;
        this.filePickerOpen = false;
    }

    async initialize(customCanvas = null) {
        if (this.initialized) {
            AppLogger.warn('Application already initialized, skipping...');
            return;
        }

        try {
            // Create canvas and WebGL context
            this.canvas = customCanvas || document.getElementById('glCanvas');
            if (!this.canvas) {
                throw new Error('Canvas element not found');
            }

            // Initialize core components in dependency order
            this.engine = new VisualizationEngine(this.canvas);
            this.engine.initialize();

            this.data = new PlotData();

            // Initialize UI controller - it will handle its sub-components internally
            this.ui = new UIController(this.engine, this.data);
            await this.ui.initialize();

            // Initialize navigation controller - it will handle accessibility sub-components internally
            this.navigation = new NavigationController(this.engine, this.data);
            await this.navigation.initialize();

            // Set dependencies on engine (dependency injection)
            this.engine.setDependencies(this.ui, this.navigation, this.data);
            
            // Set UI controller dependency on text controller (for cross-layer access)
            if (this.navigation.textController) {
                // Preserve the logger and events that were already set by NavigationController
                const currentLogger = this.navigation.textController.logger;
                const currentEvents = this.navigation.textController.events;
                this.navigation.textController.setDependencies(this.navigation, this.ui, currentLogger, currentEvents);
            }
            
            // Set review mode controller dependencies
            this.navigation.setReviewModeDependencies(this.ui);

            // Set up event listeners
            this.setupEventListeners();

            // Set global reference early so components can access it
            window.surfacePlotApp = this;
            
            // Load default data and create buffers BEFORE starting render loop
            this.loadBenzene();
            
            this.initialized = true;
            AppLogger.info('App initialized successfully with modular architecture');

            // Start the render loop AFTER data is loaded and buffers are created
            this.startRenderLoop();
        } catch (error) {
            AppLogger.error('Failed to initialize application:', error);
            // Show user-friendly error message
            const canvas = document.getElementById('glCanvas');
            if (canvas) {
                canvas.style.display = 'none';
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'text-align: center; padding: 50px; color: red; font-weight: bold;';
                errorDiv.textContent = 'Failed to initialize WebGL. Please check your browser support.';
                canvas.parentNode.insertBefore(errorDiv, canvas);
            }
        }
    }

    setupEventListeners() {
        // Clean up existing listeners first
        this.cleanupEventListeners();

        // Sample loading events
        const loadSampleHandler = (event) => {
            const sample = event.detail.sample;
            AppLogger.debug('Loading sample:', sample);
            
            try {
                this.loadSample(sample);
            } catch (error) {
                AppLogger.warn('Failed to load sample:', sample, error.message);
                this.showError('Sample Loading Error', `Failed to load ${sample}: ${error.message}`);
            }
        };
        document.addEventListener(EVENTS.SURFACE_PLOT_LOAD_SAMPLE, loadSampleHandler);
        this.eventListeners.set('load-sample', { element: document, event: EVENTS.SURFACE_PLOT_LOAD_SAMPLE, handler: loadSampleHandler });

        // Sample info panel update events
        const sampleInfoHandler = (event) => {
            this.updateSampleInfoDisplay(event.detail);
        };
        document.addEventListener(EVENTS.SAMPLE_INFO_UPDATED, sampleInfoHandler);
        this.eventListeners.set('sample-info', { element: document, event: EVENTS.SAMPLE_INFO_UPDATED, handler: sampleInfoHandler });

        // Data export events
        const exportDataHandler = () => {
            AppLogger.debug('Exporting data');
            this.exportData();
        };
        document.addEventListener(EVENTS.SURFACE_PLOT_EXPORT_DATA, exportDataHandler);
        this.eventListeners.set('export-data', { element: document, event: EVENTS.SURFACE_PLOT_EXPORT_DATA, handler: exportDataHandler });

        const exportImageHandler = () => {
            AppLogger.debug('Exporting image');
            this.exportImage();
        };
        document.addEventListener(EVENTS.SURFACE_PLOT_EXPORT_IMAGE, exportImageHandler);
        this.eventListeners.set('export-image', { element: document, event: EVENTS.SURFACE_PLOT_EXPORT_IMAGE, handler: exportImageHandler });

        // Data import events
        const importDataHandler = () => {
            AppLogger.debug('Importing data');
            this.importData();
        };
        document.addEventListener(EVENTS.SURFACE_PLOT_IMPORT_DATA, importDataHandler);
        this.eventListeners.set('import-data', { element: document, event: EVENTS.SURFACE_PLOT_IMPORT_DATA, handler: importDataHandler });

        // Custom data loading events
        const loadCustomDataHandler = () => {
            AppLogger.debug('Loading custom data');
            this.loadCustomData();
        };
        document.addEventListener(EVENTS.SURFACE_PLOT_LOAD_CUSTOM_DATA, loadCustomDataHandler);
        this.eventListeners.set('load-custom-data', { element: document, event: EVENTS.SURFACE_PLOT_LOAD_CUSTOM_DATA, handler: loadCustomDataHandler });

        const customDataLoadedHandler = () => {
            this.updateSampleInfoPanel();
            this.engine.createBuffers();
        };
        document.addEventListener(EVENTS.CUSTOM_DATA_LOADED, customDataLoadedHandler);
        this.eventListeners.set('custom-data-loaded', { element: document, event: EVENTS.CUSTOM_DATA_LOADED, handler: customDataLoadedHandler });
        
        // Listen for data label changes to update any UI components that need refreshing
        const dataLabelsChangedHandler = () => {
            // The axes controller will handle its own updates via its event listener
            // But we can trigger other updates here if needed
            this.updateSampleInfoPanel();
        };
        document.addEventListener(EVENTS.DATA_LABELS_CHANGED, dataLabelsChangedHandler);
        this.eventListeners.set('data-labels-changed', { element: document, event: EVENTS.DATA_LABELS_CHANGED, handler: dataLabelsChangedHandler });

        // Handle display mode change events from UI layer
        const displayModeChangeHandler = (event) => {
            const { displayMode } = event.detail;
            if (displayMode === 'surface') {
                // Initialize wireframe navigation if switching to surface mode
                setTimeout(() => {
                    this.navigation.initializeWireframeNavigation();
                }, 100); // Small delay to ensure buffers are created
            } else {
                // Disable wireframe highlighting when leaving surface mode
                if (this.navigation.highlightController) {
                    this.navigation.highlightController.setWireframeHighlightEnabled(false);
                }
                this.navigation.wireframeNavigationMode = false;
            }
        };
        document.addEventListener(EVENTS.DISPLAY_MODE_CHANGED, displayModeChangeHandler);
        this.eventListeners.set('display-mode-changed', { element: document, event: EVENTS.DISPLAY_MODE_CHANGED, handler: displayModeChangeHandler });

        // Handle variable selection events from UI layer
        const loadSelectedVariablesHandler = async (event) => {
            const { xVar, yVar, zVar } = event.detail;
            try {
                if (!this.pendingFileContent || !this.pendingFileType) {
                    throw new Error('No file content available');
                }

                // Clear the canvas
                this.engine.clearCanvas();

                // Load data based on file type
                if (this.pendingFileType === 'csv') {
                    await this.data.loadFromCSV(this.pendingFileContent, xVar, yVar, zVar);
                } else if (this.pendingFileType === 'json') {
                    await this.data.loadFromJSON(this.pendingFileContent, xVar, yVar, zVar);
                }

                // Update visualization
                this.engine.createBuffers();
                this.ui.updateRangeControls();
                this.navigation.onDataLoaded();

                // Clear pending data
                this.pendingFileContent = null;
                this.pendingFileType = null;

                // Notify that custom data was loaded
                document.dispatchEvent(new CustomEvent(EVENTS.CUSTOM_DATA_LOADED));

            } catch (error) {
                AppLogger.error('Error loading selected variables:', error);
                this.showError('Data Loading Error', 'Failed to load data: ' + error.message);
            }
        };
        document.addEventListener(EVENTS.LOAD_SELECTED_VARIABLES, loadSelectedVariablesHandler);
        this.eventListeners.set('load-selected-variables', { element: document, event: EVENTS.LOAD_SELECTED_VARIABLES, handler: loadSelectedVariablesHandler });

        // Error handling events
        const errorHandler = (event) => {
            this.showError(event.detail.title, event.detail.message);
        };
        document.addEventListener(EVENTS.SURFACE_PLOT_ERROR, errorHandler);
        this.eventListeners.set('error', { element: document, event: EVENTS.SURFACE_PLOT_ERROR, handler: errorHandler });
    }

    cleanupEventListeners() {
        // Clean up existing listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
    }

    startRenderLoop() {
        const render = (currentTime) => {
            this.engine.render(this.data);
            
            // Update performance metrics
            this.frameCount++;
            if (currentTime - this.lastTime >= 1000) {
                this.fps = this.frameCount;
                this.frameCount = 0;
                this.lastTime = currentTime;
                
                // Update UI with performance info
                if (this.ui) {
                    this.ui.updatePerformanceMetrics(this.fps, this.data.getDataPoints());
                }
            }
            
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    loadBenzene() {
        this.loadSample('benzene');
    }

    loadSinusoidal() {
        this.loadSample('sinusoidal');
    }

    /**
     * Load a sample using the new factory pattern
     * @param {string} sampleName - Name of the sample to load
     */
    loadSample(sampleName) {
        try {
            // Load the new sample data
            this.data.loadSample(sampleName);
            
            // CRITICAL FIX: Ensure engine always has fresh buffers regardless of navigation state
            this.engine.createBuffers();
            
            // Update UI controls with new data ranges
            this.ui.updateRangeControls();
            
            // Initialize navigation data structures (but don't update navigation info if not active)
            this.navigation.onDataLoaded();
            
            // Update the sample information panel
            this.updateSampleInfoPanel();
            
            // Force multiple immediate renders to ensure the plot appears immediately
            // This addresses the issue where plots don't render until canvas focus
            this.engine.render(this.data);
            
            // CRITICAL FIX: Ensure rendering happens regardless of focus state
            // Force multiple render calls with different timing and approaches
            requestAnimationFrame(() => {
                // First additional render
                this.engine.render(this.data);
                
                // Force canvas redraw by invalidating the canvas
                if (this.engine.gl) {
                    this.engine.gl.flush();
                    this.engine.gl.finish();
                }
                
                // One more render after a brief delay
                setTimeout(() => {
                    this.engine.render(this.data);
                    
                    // Force one final render with explicit buffer validation
                    if (this.engine.buffers && this.engine.buffers.count > 0) {
                        console.log('Final render with valid buffers:', this.engine.buffers);
                        this.engine.render(this.data);
                    } else {
                        console.warn('Buffers not ready after sample load:', this.engine.buffers);
                        // Recreate buffers and try again
                        this.engine.createBuffers();
                        this.engine.render(this.data);
                    }
                }, 50);
            });
        } catch (error) {
            AppLogger.error(`Failed to load sample ${sampleName}:`, error);
            this.showError('Sample Loading Error', `Failed to load ${sampleName}: ${error.message}`);
        }
    }

    // File operations
    async exportData() {
        try {
            const exportResult = this.data.exportToCSV();
            // The exportToCSV() returns an object with content and filename properties
            this.data.downloadFile(exportResult.content, exportResult.filename);
        } catch (error) {
            this.showError('Export failed', error.message);
        }
    }

    async exportImage() {
        try {
            // Force a render to ensure the canvas has the latest content
            this.engine.render(this.data);
            
            // Convert canvas to blob
            this.canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `surface_plot_${this.data.currentSample}_${Date.now()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                } else {
                    throw new Error('Failed to create image blob');
                }
            }, 'image/png');
        } catch (error) {
            this.showError('Image export failed', error.message);
        }
    }

    async importData() {
        if (this.filePickerOpen) return; // Prevent multiple file pickers
        
        try {
            this.filePickerOpen = true;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.json';
            input.style.display = 'none';
            document.body.appendChild(input);
            
            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (file) {
                    await this.readFile(file);
                }
                document.body.removeChild(input);
                this.filePickerOpen = false;
            };
            
            // Handle case where user cancels file picker
            input.oncancel = () => {
                document.body.removeChild(input);
                this.filePickerOpen = false;
            };
            
            input.click();
        } catch (error) {
            this.filePickerOpen = false;
            this.showError('Import failed', error.message);
        }
    }

    async loadCustomData() {
        if (this.filePickerOpen) return; // Prevent multiple file pickers
        
        try {
            this.filePickerOpen = true;
            AppLogger.debug('File picker opened - sample data still visible');
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv,.json';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            
            fileInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (file) {
                    try {
                        const content = await file.text();
                        const extension = file.name.split('.').pop().toLowerCase();
                        let headers = [];
                        
                        if (extension === 'csv') {
                            headers = content.split('\n')[0].split(',').map(h => h.trim());
                        } else if (extension === 'json') {
                            const data = JSON.parse(content);
                            headers = Object.keys(data).filter(key => Array.isArray(data[key]));
                        }
                        
                        // NOW clear the plot data after file is selected
                        AppLogger.debug('File selected - clearing plot before showing dropdowns');
                        this.data.clearData();
                        
                        // Clear buffers and render black canvas
                        this.engine.createBuffers(); // Creates empty buffers
                        this.engine.render(this.data); // Renders empty data (black canvas)
                        
                        // Clear sample info panel
                        const sampleInfoElement = document.getElementById('sampleInfo');
                        if (sampleInfoElement) sampleInfoElement.innerHTML = '';
                        
                        // Store file content for later use
                        this.pendingFileContent = content;
                        this.pendingFileType = extension;
                        
                        // Show variable selection via UI controller
                        if (this.ui.variableSelection) {
                            this.ui.variableSelection.style.display = 'flex';
                            this.ui.populateVariableDropdowns(headers);
                        }
                        
                    } catch (error) {
                        AppLogger.error('Error reading file:', error);
                        this.showError('File Error', 'Failed to read file: ' + error.message);
                    }
                }
                document.body.removeChild(fileInput);
                this.filePickerOpen = false;
            });
            
            // Handle case where user cancels file picker
            fileInput.oncancel = () => {
                document.body.removeChild(fileInput);
                this.filePickerOpen = false;
            };
            
            fileInput.click();
        } catch (error) {
            this.filePickerOpen = false;
            this.showError('Custom Data Loading Error', 'Failed to open file picker: ' + error.message);
        }
    }

    async readFile(file) {
        try {
            const extension = file.name.split('.').pop().toLowerCase();
            
            if (extension === 'csv') {
                await this.data.loadFromCSV(file);
            } else if (extension === 'json') {
                await this.data.loadFromJSON(file);
            } else {
                throw new Error('Unsupported file format. Please use CSV or JSON files.');
            }
            
            // Update visualization after loading
            this.engine.createBuffers();
            this.ui.updateRangeControls();
            this.navigation.onDataLoaded();
            this.updateSampleInfoPanel();
            
            this.showMessage(`File "${file.name}" loaded successfully!\nData points: ${this.data.getDataPoints()}`);
        } catch (error) {
            this.showError('File loading failed', error.message);
        }
    }

    showMessage(message) {
        // Create a simple modal for messages
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
            z-index: 1000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white; padding: 20px; border-radius: 5px; max-width: 400px;
            color: black; text-align: center;
        `;
        content.innerHTML = `
            <p style="margin: 0 0 15px 0; white-space: pre-line;">${message}</p>
            <button onclick="this.closest('.modal').remove()" style="padding: 8px 16px;">OK</button>
        `;
        
        modal.className = 'modal';
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    showError(title, message) {
        AppLogger.error(`${title}: ${message}`);
        this.showMessage(`${title}\n\n${message}`);
    }

    updateSampleInfoPanel() {
        const info = this.data.getSampleInfo();
        const event = new CustomEvent(EVENTS.SAMPLE_INFO_UPDATED, { detail: info });
        document.dispatchEvent(event);
    }

    /**
     * Update the sample info display with comprehensive statistics
     * @param {Object} info - Sample information including statistics
     */
    updateSampleInfoDisplay(info) {
        const sampleInfoElement = document.getElementById('sampleInfo');
        if (!sampleInfoElement) {
            AppLogger.debug('Sample info element not found, skipping display update');
            return;
        }

        // Import DescriptiveStatistics for formatting
        import('./core/DescriptiveStatistics.js').then(({ DescriptiveStatistics }) => {
            const stats = info.statistics;
            
            // Helper function to format values with units
            const formatWithUnit = (value, unit, decimals = 3) => {
                const formatted = DescriptiveStatistics.formatValue(value, decimals);
                return unit ? `${formatted} ${unit}` : formatted;
            };

            // Create comprehensive statistics display
            const statsHTML = `
                <div class="sample-stats">
                    <h4>${info.name} (${info.plotType})</h4>
                    <p class="description">${info.description}</p>
                    
                    <div class="stats-grid">
                        <div class="dimension-stats">
                            <h5>${info.labels.x}</h5>
                            <div class="stat-row">
                                <span class="stat-label">Range:</span>
                                <span class="stat-value">${formatWithUnit(stats.x.min, info.units.x)} to ${formatWithUnit(stats.x.max, info.units.x)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Highest:</span>
                                <span class="stat-value highlight">${formatWithUnit(stats.x.max, info.units.x)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Mean:</span>
                                <span class="stat-value">${formatWithUnit(stats.x.mean, info.units.x)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Median:</span>
                                <span class="stat-value">${formatWithUnit(stats.x.median, info.units.x)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Std Dev:</span>
                                <span class="stat-value">${formatWithUnit(stats.x.standardDeviation, info.units.x)}</span>
                            </div>
                        </div>

                        <div class="dimension-stats">
                            <h5>${info.labels.y}</h5>
                            <div class="stat-row">
                                <span class="stat-label">Range:</span>
                                <span class="stat-value">${formatWithUnit(stats.y.min, info.units.y)} to ${formatWithUnit(stats.y.max, info.units.y)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Highest:</span>
                                <span class="stat-value highlight">${formatWithUnit(stats.y.max, info.units.y)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Mean:</span>
                                <span class="stat-value">${formatWithUnit(stats.y.mean, info.units.y)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Median:</span>
                                <span class="stat-value">${formatWithUnit(stats.y.median, info.units.y)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Std Dev:</span>
                                <span class="stat-value">${formatWithUnit(stats.y.standardDeviation, info.units.y)}</span>
                            </div>
                        </div>

                        <div class="dimension-stats">
                            <h5>${info.labels.z}</h5>
                            <div class="stat-row">
                                <span class="stat-label">Range:</span>
                                <span class="stat-value">${formatWithUnit(stats.z.min, info.units.z)} to ${formatWithUnit(stats.z.max, info.units.z)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Highest:</span>
                                <span class="stat-value highlight">${formatWithUnit(stats.z.max, info.units.z)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Mean:</span>
                                <span class="stat-value">${formatWithUnit(stats.z.mean, info.units.z)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Median:</span>
                                <span class="stat-value">${formatWithUnit(stats.z.median, info.units.z)}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Std Dev:</span>
                                <span class="stat-value">${formatWithUnit(stats.z.standardDeviation, info.units.z)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="summary-stats">
                        <h5>Dataset Summary</h5>
                        <div class="stat-row">
                            <span class="stat-label">Total Points:</span>
                            <span class="stat-value">${stats.overall.totalPoints.toLocaleString()}</span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Data Integrity:</span>
                            <span class="stat-value ${stats.overall.dataIntegrity.isValid ? 'valid' : 'invalid'}">
                                ${stats.overall.dataIntegrity.isValid ? 'Valid' : 'Issues Detected'}
                            </span>
                        </div>
                        ${stats.x.mode !== null ? `
                        <div class="stat-row">
                            <span class="stat-label">Mode (${info.labels.x}):</span>
                            <span class="stat-value">${formatWithUnit(stats.x.mode, info.units.x)}</span>
                        </div>` : ''}
                        <div class="stat-row">
                            <span class="stat-label">Skewness (${info.labels.y}):</span>
                            <span class="stat-value">${DescriptiveStatistics.formatValue(stats.y.skewness)}</span>
                        </div>
                    </div>
                </div>
            `;

            sampleInfoElement.innerHTML = statsHTML;
        }).catch(error => {
            AppLogger.error('Failed to load DescriptiveStatistics for display formatting:', error);
            // Fallback to basic display
            sampleInfoElement.innerHTML = `
                <div class="sample-stats">
                    <h4>${info.name} (${info.plotType})</h4>
                    <p>${info.description}</p>
                    <p>Points: ${info.points.toLocaleString()}</p>
                    <p>Basic ranges available - Statistics display error</p>
                </div>
            `;
        });
    }

    // Cleanup method following architecture principles
    destroy() {
        // Clean up event listeners
        this.cleanupEventListeners();
        
        // Destroy layer controllers in reverse dependency order
        if (this.navigation) {
            this.navigation.destroy();
            this.navigation = null;
        }
        
        if (this.ui) {
            this.ui.destroy();
            this.ui = null;
        }
        
        if (this.engine) {
            this.engine.destroy();
            this.engine = null;
        }
        
        if (this.data) {
            this.data = null;
        }
        
        // Clear global reference
        window.surfacePlotApp = null;
        
        // Reset initialization flag
        this.initialized = false;
        
                    AppLogger.info('Application destroyed and cleaned up following architecture');
    }
}