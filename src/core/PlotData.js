// PlotData.js - Universal data management for multiple plot types
import { PlotDataFactory } from './PlotDataFactory.js';
import { FileOperations } from '../utils/FileOperations.js';
import { DescriptiveStatistics } from './DescriptiveStatistics.js';
import { DataLogger } from '../utils/Logger.js';
import { EVENTS } from '../constants/EventConstants.js';

export class PlotData {
    // Static regex patterns for header parsing (avoid repeated allocations)
    static HEADER_PATTERNS = [
        /^(.+?)\s*\(([^)]+)\)\s*$/,  // "precipitation (mm)"
        /^(.+?)\s*\[([^\]]+)\]\s*$/,  // "velocity [m/s]"
        /^(.+?)\s*\{([^}]+)\}\s*$/,   // "temperature {°C}"
        /^(.+?)\s*<([^>]+)>\s*$/     // "pressure <Pa>"
    ];

    constructor() {
        this.xValues = [];
        this.zValues = [];
        this.yValues = [];
        this.currentSample = 'sample_data';
        this.plotType = 'surface'; // Default to surface plots for backward compatibility
        
        // Store labels for axes (can be customized)
        this.xLabel = 'X';
        this.yLabel = 'Y';
        this.zLabel = 'Z';
        this.xUnit = '';
        this.yUnit = '';
        this.zUnit = '';
        this.description = '';

        // Initialize file operations
        this.fileOperations = new FileOperations(this);
    }

    /**
     * Parse header string to extract variable name and unit
     * Handles formats like "precipitation (mm)", "Temperature(°C)", "velocity [m/s]", etc.
     * @param {string} header - The header string to parse
     * @returns {Object} Object with label and unit
     */
    parseHeaderLabelAndUnit(header) {
        if (!header || typeof header !== 'string') {
            return { label: 'Unknown', unit: '' };
        }

        // Clean up the header
        const cleanHeader = header.trim();
        
        // Use static patterns to avoid repeated allocations
        for (const pattern of PlotData.HEADER_PATTERNS) {
            const match = cleanHeader.match(pattern);
            if (match) {
                return {
                    label: match[1].trim(),
                    unit: match[2].trim()
                };
            }
        }

        // If no unit pattern found, return the entire header as label with no unit
        return {
            label: cleanHeader,
            unit: ''
        };
    }

    /**
     * Sets data directly with validation
     * @param {Array} xValues - X coordinate values
     * @param {Array} zValues - Z coordinate values  
     * @param {Array} yValues - Y coordinate values
     * @param {string} sampleName - Name of the sample
     * @param {Object} labels - Axis labels and metadata
     * @param {string} plotType - Type of plot (defaults to 'surface')
     */
    setData(xValues, zValues, yValues, sampleName, labels = null, plotType = 'surface') {
        if (xValues.length !== zValues.length || xValues.length !== yValues.length) {
            throw new Error('Data arrays must have the same length');
        }
        
        this.xValues = xValues;
        this.zValues = zValues;
        this.yValues = yValues;
        this.currentSample = sampleName || 'custom';
        this.plotType = plotType;
        
        // Set custom labels if provided
        if (labels) {
            this.xLabel = labels.xLabel || 'X';
            this.yLabel = labels.yLabel || 'Y';
            this.zLabel = labels.zLabel || 'Z';
            this.xUnit = labels.xUnit || '';
            this.yUnit = labels.yUnit || '';
            this.zUnit = labels.zUnit || '';
            this.description = labels.description || '';
        }

        // After data is set, notify components that need to update labels
        this.notifyDataChanged();
    }

    /**
     * Notify other components that data has changed so they can update labels
     */
    notifyDataChanged() {
        // Dispatch event to update axes labels
        document.dispatchEvent(new CustomEvent(EVENTS.DATA_LABELS_CHANGED, {
            detail: {
                xLabel: this.xLabel,
                yLabel: this.yLabel,
                zLabel: this.zLabel,
                xUnit: this.xUnit,
                yUnit: this.yUnit,
                zUnit: this.zUnit
            }
        }));
    }

    /**
     * Loads sample data using the factory pattern
     * @param {string} sampleName - Name of the sample to load
     * @param {string} plotType - Type of plot (defaults to current plotType)
     */
    loadSample(sampleName, plotType = null) {
        const targetPlotType = plotType || this.plotType;
        
        try {
            const rawData = PlotDataFactory.createPlotData(targetPlotType, sampleName);
            const normalizedData = PlotDataFactory.normalizeData(rawData);
            
            this.setData(
                normalizedData.xValues, 
                normalizedData.zValues, 
                normalizedData.yValues, 
                normalizedData.sampleName,
                normalizedData.labels,
                normalizedData.plotType
            );
            
            this.description = normalizedData.description;
            
            DataLogger.info(`Loaded ${sampleName} ${targetPlotType} data points:`, 
                       this.xValues.length, 'points');
        } catch (error) {
            DataLogger.error(`Failed to load sample ${sampleName}:`, error);
            throw error;
        }
    }

    /**
     * Gets available samples for current or specified plot type
     * @param {string} plotType - Plot type to get samples for (defaults to current)
     * @returns {Array} Available samples
     */
    getAvailableSamples(plotType = null) {
        const targetPlotType = plotType || this.plotType;
        return PlotDataFactory.getAvailableSamples(targetPlotType);
    }

    /**
     * Gets all supported plot types
     * @returns {Array} Supported plot types
     */
    getSupportedPlotTypes() {
        return PlotDataFactory.getSupportedPlotTypes();
    }

    /**
     * Changes the current plot type
     * @param {string} newPlotType - The new plot type to switch to
     */
    setPlotType(newPlotType) {
        const supportedTypes = this.getSupportedPlotTypes().map(type => type.id);
        if (!supportedTypes.includes(newPlotType)) {
            throw new Error(`Unsupported plot type: ${newPlotType}. Supported types: ${supportedTypes.join(', ')}`);
        }
        this.plotType = newPlotType;
    }

    /**
     * Clears all data, leaving the plot empty
     */
    clearData() {
        this.xValues = [];
        this.zValues = [];
        this.yValues = [];
        this.currentSample = '';
        this.xLabel = 'X';
        this.yLabel = 'Y';
        this.zLabel = 'Z';
        this.xUnit = '';
        this.yUnit = '';
        this.zUnit = '';
        this.description = '';
        
        // Notify components that data (including labels) has been cleared
        this.notifyDataChanged();
        
        DataLogger.debug('Plot data cleared');
    }

    // File operations methods
    async loadFromCSV(content, xVar = null, yVar = null, zVar = null) {
        try {
            const lines = content.split('\n');
            const originalHeaders = lines[0].split(',').map(h => h.trim());
            const lowerHeaders = originalHeaders.map(h => h.toLowerCase());
            
            // Find column indices based on provided variables or default to first three numeric columns
            let xIndex, yIndex, zIndex;
            
            if (xVar && yVar && zVar) {
                xIndex = lowerHeaders.findIndex(h => h === xVar.toLowerCase());
                yIndex = lowerHeaders.findIndex(h => h === yVar.toLowerCase());
                zIndex = lowerHeaders.findIndex(h => h === zVar.toLowerCase());
                
                // Validate that all requested variables were found
                if (xIndex === -1) {
                    throw new Error(`X variable '${xVar}' not found in CSV headers: ${originalHeaders.join(', ')}`);
                }
                if (yIndex === -1) {
                    throw new Error(`Y variable '${yVar}' not found in CSV headers: ${originalHeaders.join(', ')}`);
                }
                if (zIndex === -1) {
                    throw new Error(`Z variable '${zVar}' not found in CSV headers: ${originalHeaders.join(', ')}`);
                }
            } else {
                // Default to first three numeric columns
                if (originalHeaders.length < 3) {
                    throw new Error(`CSV must have at least 3 columns, found: ${originalHeaders.length}`);
                }
                xIndex = 0;
                yIndex = 1;
                zIndex = 2;
            }

            const xValues = [];
            const yValues = [];
            const zValues = [];

            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '') continue;
                
                const values = lines[i].split(',').map(v => v.trim());
                
                const x = parseFloat(values[xIndex]);
                const y = parseFloat(values[yIndex]);
                const z = parseFloat(values[zIndex]);
                
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    xValues.push(x);
                    yValues.push(y);
                    zValues.push(z);
                }
            }

            // Parse headers to extract variable names and units
            const xHeaderInfo = this.parseHeaderLabelAndUnit(xVar || originalHeaders[xIndex]);
            const yHeaderInfo = this.parseHeaderLabelAndUnit(yVar || originalHeaders[yIndex]);
            const zHeaderInfo = this.parseHeaderLabelAndUnit(zVar || originalHeaders[zIndex]);

            this.setData(
                new Float32Array(xValues),
                new Float32Array(yValues),
                new Float32Array(zValues),
                'custom',
                {
                    xLabel: xHeaderInfo.label,
                    yLabel: yHeaderInfo.label,
                    zLabel: zHeaderInfo.label,
                    xUnit: xHeaderInfo.unit,
                    yUnit: yHeaderInfo.unit,
                    zUnit: zHeaderInfo.unit,
                    description: 'Custom CSV data'
                }
            );

            return true;
        } catch (error) {
            throw new Error(`CSV import failed: ${error.message}`);
        }
    }

    async loadFromJSON(content, xVar = null, yVar = null, zVar = null) {
        try {
            const data = JSON.parse(content);
            
            // Get available arrays
            const arrays = Object.entries(data)
                .filter(([_, value]) => Array.isArray(value))
                .map(([key, _]) => key);
            
            if (arrays.length < 3) {
                throw new Error('JSON must contain at least 3 numeric arrays');
            }

            // Use provided variables or default to first three arrays
            const xKey = xVar || arrays[0];
            const yKey = yVar || arrays[1];
            const zKey = zVar || arrays[2];

            if (!data[xKey] || !data[yKey] || !data[zKey]) {
                throw new Error('Required arrays not found in JSON');
            }

            // Convert to Float32Array and validate
            const xValues = new Float32Array(data[xKey].map(v => parseFloat(v)));
            const yValues = new Float32Array(data[yKey].map(v => parseFloat(v)));
            const zValues = new Float32Array(data[zKey].map(v => parseFloat(v)));

            if (xValues.length !== yValues.length || xValues.length !== zValues.length) {
                throw new Error('Arrays must have the same length');
            }

            // Parse keys to extract variable names and units
            const xHeaderInfo = this.parseHeaderLabelAndUnit(xKey);
            const yHeaderInfo = this.parseHeaderLabelAndUnit(yKey);
            const zHeaderInfo = this.parseHeaderLabelAndUnit(zKey);

            this.setData(
                xValues,
                yValues,
                zValues,
                'custom',
                {
                    xLabel: xHeaderInfo.label,
                    yLabel: yHeaderInfo.label,
                    zLabel: zHeaderInfo.label,
                    xUnit: xHeaderInfo.unit,
                    yUnit: yHeaderInfo.unit,
                    zUnit: zHeaderInfo.unit,
                    description: 'Custom JSON data'
                }
            );

            return true;
        } catch (error) {
            throw new Error(`JSON import failed: ${error.message}`);
        }
    }

    exportToCSV() {
        return this.fileOperations.exportToCSV();
    }

    exportToJSON() {
        return this.fileOperations.exportToJSON();
    }

    downloadFile(content, filename) {
        return this.fileOperations.downloadFile(content, filename);
    }

    getDataRange() {
        return {
            x: {
                min: Math.min(...this.xValues),
                max: Math.max(...this.xValues)
            },
            z: {
                min: Math.min(...this.zValues),
                max: Math.max(...this.zValues)
            },
            y: {
                min: Math.min(...this.yValues),
                max: Math.max(...this.yValues)
            }
        };
    }

    getDataPoints() {
        return this.xValues.length;
    }

    getSampleInfo() {
        // Calculate comprehensive statistics
        const statistics = this.getDescriptiveStatistics();
        
        return {
            name: this.currentSample,
            plotType: this.plotType,
            points: this.getDataPoints(),
            ranges: this.getDataRange(),
            statistics: statistics,
            labels: {
                x: this.xLabel,
                y: this.yLabel,
                z: this.zLabel
            },
            units: {
                x: this.xUnit,
                y: this.yUnit,
                z: this.zUnit
            },
            description: this.description
        };
    }

    /**
     * Get comprehensive descriptive statistics for all dimensions
     * @returns {Object} Detailed statistics including highest values, ranges, mean, median, mode, etc.
     */
    getDescriptiveStatistics() {
        return DescriptiveStatistics.calculateFullStatistics(
            this.xValues, 
            this.yValues, 
            this.zValues
        );
    }
    
    // Backward compatibility methods for existing code
    get wavelengths() { return this.xValues; }
    get retentionTimes() { return this.zValues; }
    get intensities() { return this.yValues; }
} 