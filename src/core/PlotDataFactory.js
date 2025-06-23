// PlotDataFactory.js - Factory for creating different plot types
import { SurfacePlotDataGenerator } from '../plots/surface/SurfacePlotDataGenerator.js';

export class PlotDataFactory {
    
    /**
     * Creates plot data based on plot type and sample name
     * @param {string} plotType - The type of plot ('surface', etc.)
     * @param {string} sampleName - The sample to generate
     * @returns {Object} Plot data object with standardized structure
     */
    static createPlotData(plotType, sampleName) {
        switch (plotType) {
            case 'surface':
                return PlotDataFactory.createSurfacePlotData(sampleName);
            default:
                throw new Error(`Unsupported plot type: ${plotType}`);
        }
    }

    /**
     * Creates surface plot data
     * @param {string} sampleName - The surface sample to generate
     * @returns {Object} Surface plot data
     */
    static createSurfacePlotData(sampleName) {
        let data;
        
        switch (sampleName) {
            case 'benzene':
                data = SurfacePlotDataGenerator.generateBenzene();
                break;
            case 'sinusoidal':
                data = SurfacePlotDataGenerator.generateSinusoidal();
                break;

            default:
                throw new Error(`Unknown surface plot sample: ${sampleName}`);
        }

        return data;
    }

    /**
     * Gets available samples for a specific plot type
     * @param {string} plotType - The plot type to get samples for
     * @returns {Array} Array of available sample descriptions
     */
    static getAvailableSamples(plotType) {
        switch (plotType) {
            case 'surface':
                return SurfacePlotDataGenerator.getAvailableSamples();
            default:
                return [];
        }
    }

    /**
     * Gets all supported plot types
     * @returns {Array} Array of supported plot type information
     */
    static getSupportedPlotTypes() {
        return [
            {
                id: 'surface',
                name: 'Surface Plot',
                description: '3D surface visualization with X, Y, Z coordinates',
                dataStructure: 'point-cloud'
            }
            // Future plot types can be added here:
            // {
            //     id: 'scatter',
            //     name: 'Scatter Plot',
            //     description: '3D scatter plot visualization',
            //     dataStructure: 'point-cloud'
            // },
            // {
            //     id: 'line',
            //     name: 'Line Plot',
            //     description: '3D line plot visualization',
            //     dataStructure: 'line-segments'
            // }
        ];
    }

    /**
     * Validates plot data structure
     * @param {Object} plotData - The plot data to validate
     * @returns {boolean} True if valid, throws error if invalid
     */
    static validatePlotData(plotData) {
        if (!plotData) {
            throw new Error('Plot data is null or undefined');
        }

        if (!plotData.plotType) {
            throw new Error('Plot data missing plotType field');
        }

        if (!plotData.xValues || !plotData.yValues || !plotData.zValues) {
            throw new Error('Plot data missing coordinate arrays');
        }

        if (plotData.xValues.length !== plotData.yValues.length || 
            plotData.xValues.length !== plotData.zValues.length) {
            throw new Error('Plot data coordinate arrays have mismatched lengths');
        }

        if (!plotData.metadata) {
            throw new Error('Plot data missing metadata');
        }

        return true;
    }

    /**
     * Converts plot data to standardized format for the core data layer
     * @param {Object} plotData - The plot data from generator
     * @returns {Object} Standardized data format
     */
    static normalizeData(plotData) {
        PlotDataFactory.validatePlotData(plotData);
        
        return {
            plotType: plotData.plotType,
            xValues: plotData.xValues,
            yValues: plotData.yValues,
            zValues: plotData.zValues,
            sampleName: plotData.sampleName,
            labels: {
                xLabel: plotData.metadata.xLabel,
                yLabel: plotData.metadata.yLabel,
                zLabel: plotData.metadata.zLabel,
                xUnit: plotData.metadata.xUnit,
                yUnit: plotData.metadata.yUnit,
                zUnit: plotData.metadata.zUnit
            },
            description: plotData.metadata.description
        };
    }
} 