// DescriptiveStatistics.js - Comprehensive statistical calculations for plot data
// This file is only accessed by PlotData.js for computing descriptive statistics

export class DescriptiveStatistics {
    
    /**
     * Calculate comprehensive statistics for a dataset
     * @param {Float32Array|Array} values - Array of numeric values
     * @returns {Object} Object containing all statistical measures
     */
    static calculateStats(values) {
        if (!values || values.length === 0) {
            return DescriptiveStatistics.getEmptyStats();
        }

        // Convert to regular array for calculations
        const data = Array.from(values);
        const sorted = [...data].sort((a, b) => a - b);
        const n = data.length;

        // Basic statistics
        const min = sorted[0];
        const max = sorted[n - 1];
        const range = max - min;
        const sum = data.reduce((acc, val) => acc + val, 0);
        const mean = sum / n;

        // Median calculation
        let median;
        if (n % 2 === 0) {
            median = (sorted[n/2 - 1] + sorted[n/2]) / 2;
        } else {
            median = sorted[Math.floor(n/2)];
        }

        // Mode calculation (most frequent value)
        const frequency = {};
        data.forEach(val => {
            const rounded = Math.round(val * 1000) / 1000; // Round to avoid floating point issues
            frequency[rounded] = (frequency[rounded] || 0) + 1;
        });
        
        const maxFreq = Math.max(...Object.values(frequency));
        const modes = Object.keys(frequency).filter(key => frequency[key] === maxFreq);
        const mode = modes.length === n ? null : parseFloat(modes[0]); // null if all values unique

        // Variance and standard deviation
        const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
        const standardDeviation = Math.sqrt(variance);

        // Quartiles
        const q1Index = Math.floor(n * 0.25);
        const q3Index = Math.floor(n * 0.75);
        const q1 = sorted[q1Index];
        const q3 = sorted[q3Index];
        const iqr = q3 - q1;

        // Skewness (measure of asymmetry)
        const skewness = DescriptiveStatistics.calculateSkewness(data, mean, standardDeviation);

        // Kurtosis (measure of tail heaviness)
        const kurtosis = DescriptiveStatistics.calculateKurtosis(data, mean, standardDeviation);

        // Additional percentiles
        const p10 = sorted[Math.floor(n * 0.1)];
        const p90 = sorted[Math.floor(n * 0.9)];

        return {
            count: n,
            min: min,
            max: max,
            range: range,
            sum: sum,
            mean: mean,
            median: median,
            mode: mode,
            variance: variance,
            standardDeviation: standardDeviation,
            q1: q1,
            q3: q3,
            iqr: iqr,
            p10: p10,
            p90: p90,
            skewness: skewness,
            kurtosis: kurtosis
        };
    }

    /**
     * Calculate skewness (measure of asymmetry)
     * @param {Array} data - Array of numeric values
     * @param {number} mean - Pre-calculated mean
     * @param {number} stdDev - Pre-calculated standard deviation
     * @returns {number} Skewness value
     */
    static calculateSkewness(data, mean, stdDev) {
        if (stdDev === 0) return 0;
        
        const n = data.length;
        const skewSum = data.reduce((acc, val) => {
            return acc + Math.pow((val - mean) / stdDev, 3);
        }, 0);
        
        return skewSum / n;
    }

    /**
     * Calculate kurtosis (measure of tail heaviness)
     * @param {Array} data - Array of numeric values
     * @param {number} mean - Pre-calculated mean
     * @param {number} stdDev - Pre-calculated standard deviation
     * @returns {number} Kurtosis value (excess kurtosis)
     */
    static calculateKurtosis(data, mean, stdDev) {
        if (stdDev === 0) return 0;
        
        const n = data.length;
        const kurtSum = data.reduce((acc, val) => {
            return acc + Math.pow((val - mean) / stdDev, 4);
        }, 0);
        
        return (kurtSum / n) - 3; // Subtract 3 for excess kurtosis
    }

    /**
     * Calculate comprehensive statistics for all three dimensions
     * @param {Float32Array|Array} xValues - X coordinate values
     * @param {Float32Array|Array} yValues - Y coordinate values
     * @param {Float32Array|Array} zValues - Z coordinate values
     * @returns {Object} Comprehensive statistics for all dimensions
     */
    static calculateFullStatistics(xValues, yValues, zValues) {
        return {
            x: DescriptiveStatistics.calculateStats(xValues),
            y: DescriptiveStatistics.calculateStats(yValues),
            z: DescriptiveStatistics.calculateStats(zValues),
            overall: {
                totalPoints: xValues ? xValues.length : 0,
                dataIntegrity: DescriptiveStatistics.checkDataIntegrity(xValues, yValues, zValues)
            }
        };
    }

    /**
     * Check data integrity across all dimensions
     * @param {Float32Array|Array} xValues - X coordinate values
     * @param {Float32Array|Array} yValues - Y coordinate values
     * @param {Float32Array|Array} zValues - Z coordinate values
     * @returns {Object} Data integrity information
     */
    static checkDataIntegrity(xValues, yValues, zValues) {
        const xLen = xValues ? xValues.length : 0;
        const yLen = yValues ? yValues.length : 0;
        const zLen = zValues ? zValues.length : 0;
        
        const lengthsMatch = (xLen === yLen) && (yLen === zLen);
        const hasData = xLen > 0 && yLen > 0 && zLen > 0;
        
        // Check for NaN or infinite values
        const xValid = xValues ? Array.from(xValues).every(val => isFinite(val)) : false;
        const yValid = yValues ? Array.from(yValues).every(val => isFinite(val)) : false;
        const zValid = zValues ? Array.from(zValues).every(val => isFinite(val)) : false;
        
        return {
            lengthsMatch: lengthsMatch,
            hasData: hasData,
            allFinite: xValid && yValid && zValid,
            lengths: { x: xLen, y: yLen, z: zLen },
            isValid: lengthsMatch && hasData && xValid && yValid && zValid
        };
    }

    /**
     * Format a statistical value for display
     * @param {number} value - The value to format
     * @param {number} decimals - Number of decimal places (default: 3)
     * @returns {string} Formatted value
     */
    static formatValue(value, decimals = 3) {
        if (value === null || value === undefined) {
            return 'N/A';
        }
        if (!isFinite(value)) {
            return 'Invalid';
        }
        
        // Use scientific notation for very large or very small numbers
        if (Math.abs(value) >= 1000000 || (Math.abs(value) < 0.001 && value !== 0)) {
            return value.toExponential(2);
        }
        
        return value.toFixed(decimals);
    }

    /**
     * Get empty statistics object for error cases
     * @returns {Object} Empty statistics with null values
     */
    static getEmptyStats() {
        return {
            count: 0,
            min: null,
            max: null,
            range: null,
            sum: null,
            mean: null,
            median: null,
            mode: null,
            variance: null,
            standardDeviation: null,
            q1: null,
            q3: null,
            iqr: null,
            p10: null,
            p90: null,
            skewness: null,
            kurtosis: null
        };
    }

    /**
     * Generate a summary interpretation of the statistics
     * @param {Object} stats - Statistics object from calculateStats
     * @param {string} dimensionName - Name of the dimension (X, Y, Z)
     * @returns {string} Human-readable interpretation
     */
    static generateSummary(stats, dimensionName) {
        if (!stats || stats.count === 0) {
            return `${dimensionName}: No data available`;
        }

        const distribution = DescriptiveStatistics.describeDistribution(stats);
        const spread = DescriptiveStatistics.describeSpread(stats);
        
        return `${dimensionName}: ${distribution}, ${spread}`;
    }

    /**
     * Describe the distribution characteristics
     * @param {Object} stats - Statistics object
     * @returns {string} Distribution description
     */
    static describeDistribution(stats) {
        if (Math.abs(stats.skewness) < 0.5) {
            return "approximately symmetric";
        } else if (stats.skewness > 0.5) {
            return "right-skewed (tail extends right)";
        } else {
            return "left-skewed (tail extends left)";
        }
    }

    /**
     * Describe the spread characteristics
     * @param {Object} stats - Statistics object
     * @returns {string} Spread description
     */
    static describeSpread(stats) {
        const cv = stats.standardDeviation / Math.abs(stats.mean); // Coefficient of variation
        
        if (cv < 0.1) {
            return "low variability";
        } else if (cv < 0.3) {
            return "moderate variability";
        } else {
            return "high variability";
        }
    }
} 