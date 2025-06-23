// SurfacePlotDataGenerator.js - Surface plot specific data generation
export class SurfacePlotDataGenerator {
    
    /**
     * Generate benzene VUV spectroscopy surface data
     * Creates 3D surface representing wavelength vs retention time vs intensity
     */
    static generateBenzene() {
        const xValues = [];  // X coordinate data (wavelength)
        const zValues = [];  // Z coordinate data (retention time)
        const yValues = [];  // Y coordinate data (intensity)
        
        // Generate peak pattern simulating benzene elution profile
        const benzeneRT = 6.8;  // Peak center at Z = 6.8
        const peakWidth = 0.8;  // Peak width
        
        for (let x = 120; x <= 200; x += 2) {    // X range (wavelength)
            for (let z = 0; z <= 15; z += 0.2) { // Z range (retention time)
                xValues.push(x);
                zValues.push(z);
                
                let y = 0;  // Y value (intensity)
                const zFactor = Math.exp(-0.5 * Math.pow((z - benzeneRT) / peakWidth, 2));
                
                // Main peak at X = 180
                if (x >= 175 && x <= 185) {
                    const xFactor = Math.exp(-0.5 * Math.pow((x - 180) / 3, 2));
                    y = zFactor * xFactor * 2.0;
                } else if (x >= 160 && x <= 170) {
                    const xFactor = Math.exp(-0.5 * Math.pow((x - 165) / 4, 2));
                    y = zFactor * xFactor * 0.8;
                } else {
                    y = zFactor * 0.1 + Math.random() * 0.05;
                }
                
                yValues.push(y);
            }
        }
        
        return {
            plotType: 'surface',
            xValues: new Float32Array(xValues),
            zValues: new Float32Array(zValues),
            yValues: new Float32Array(yValues),
            sampleName: 'benzene',
            metadata: {
                xLabel: 'Wavelength',
                yLabel: 'Intensity', 
                zLabel: 'Time',
                xUnit: 'nm',
                yUnit: 'AU',
                zUnit: 'min',
                description: 'VUV Spectroscopy - Benzene Sample'
            }
        };
    }

    /**
     * Generate sinusoidal surface data
     * Creates mathematical surface with sinusoidal pattern
     */
    static generateSinusoidal() {
        const xValues = [];
        const zValues = [];
        const yValues = [];
        
        // Reduced grid size for better performance and larger points
        const xMin = -3, xMax = 3, xStep = 0.3;  // 20 points
        const zMin = -3, zMax = 3, zStep = 0.3;  // 20 points
        
        for (let x = xMin; x <= xMax; x += xStep) {
            for (let z = zMin; z <= zMax; z += zStep) {
                xValues.push(x);
                zValues.push(z);
                
                // Generate sinusoidal surface: y = sin(x) * cos(z)
                // Shift and scale to make Y values positive and larger: 0 to 2
                const y = (Math.sin(x) * Math.cos(z) + 1) * 1.0; // Range: 0 to 2
                yValues.push(y);
            }
        }
        
        return {
            plotType: 'surface',
            xValues: new Float32Array(xValues),
            zValues: new Float32Array(zValues),
            yValues: new Float32Array(yValues),
            sampleName: 'sinusoidal',
            metadata: {
                xLabel: 'X Coordinate',
                yLabel: 'Y Value',
                zLabel: 'Z Coordinate',
                xUnit: 'units',
                yUnit: 'units',
                zUnit: 'units',
                description: 'Mathematical Sinusoidal Surface'
            }
        };
    }



    /**
     * Get list of available surface plot samples
     */
    static getAvailableSamples() {
        return [
            {
                id: 'benzene',
                name: 'Benzene VUV Spectroscopy',
                description: 'Real-world spectroscopy data with benzene peaks',
                generator: 'generateBenzene'
            },
            {
                id: 'sinusoidal',
                name: 'Sinusoidal Surface',
                description: 'Mathematical sinusoidal surface pattern',
                generator: 'generateSinusoidal'
            },

        ];
    }
} 