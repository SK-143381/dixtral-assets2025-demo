// FileOperations.js - File import/export operations
export class FileOperations {
    constructor(plotData) {
        this.data = plotData;
    }

    exportToCSV() {
        if (!this.data.xValues || this.data.xValues.length === 0) {
            throw new Error('No data available to export');
        }

        // Get labels and units from data
        const xLabel = this.data.xLabel || 'X';
        const yLabel = this.data.yLabel || 'Y';
        const zLabel = this.data.zLabel || 'Z';
        const xUnit = this.data.xUnit ? ` (${this.data.xUnit})` : '';
        const yUnit = this.data.yUnit ? ` (${this.data.yUnit})` : '';
        const zUnit = this.data.zUnit ? ` (${this.data.zUnit})` : '';

        let csvContent = `${xLabel}${xUnit},${zLabel}${zUnit},${yLabel}${yUnit},Sample\n`;
        
        for (let i = 0; i < this.data.xValues.length; i++) {
            csvContent += `${this.data.xValues[i]},${this.data.zValues[i]},${this.data.yValues[i]},${this.data.currentSample}\n`;
        }
        
        return {
            content: csvContent,
            filename: `surface_plot_data_${this.data.currentSample}_${new Date().getTime()}.csv`
        };
    }

    exportToJSON() {
        if (!this.data.xValues || this.data.xValues.length === 0) {
            throw new Error('No data available to export');
        }

        const jsonData = {
            plotType: this.data.plotType,
            xValues: Array.from(this.data.xValues),
            yValues: Array.from(this.data.yValues),
            zValues: Array.from(this.data.zValues),
            sampleName: this.data.currentSample,
            metadata: {
                xLabel: this.data.xLabel || 'X',
                yLabel: this.data.yLabel || 'Y',
                zLabel: this.data.zLabel || 'Z',
                xUnit: this.data.xUnit || '',
                yUnit: this.data.yUnit || '',
                zUnit: this.data.zUnit || '',
                description: this.data.description || ''
            }
        };

        return {
            content: JSON.stringify(jsonData, null, 2),
            filename: `surface_plot_data_${this.data.currentSample}_${new Date().getTime()}.json`
        };
    }

    exportCanvas(canvas) {
        if (!canvas) {
            throw new Error('No canvas found to export');
        }

        // Make sure canvas size is properly set to avoid empty exports
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        // Copy the WebGL canvas to a 2D canvas to ensure proper export
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve, reject) => {
            tempCanvas.toBlob((blob) => {
                if (blob) {
                    resolve({
                        blob,
                        filename: `surface_plot_visualization_${this.data.currentSample}_${new Date().getTime()}.png`
                    });
                } else {
                    reject(new Error('Failed to create canvas blob'));
                }
            }, 'image/png', 1.0);
        });
    }

    importFromJSON(content) {
        try {
            const data = JSON.parse(content);
            
                    // Support both old and new data formats
        const xValues = data.xValues || data.wavelengths;
        const zValues = data.zValues || data.retentionTimes;
        const yValues = data.yValues || data.intensities;
        
        if (!xValues || !zValues || !yValues) {
            throw new Error('Invalid JSON format: missing required coordinate fields (xValues/wavelengths, zValues/retentionTimes, yValues/intensities)');
        }

        if (xValues.length !== zValues.length || xValues.length !== yValues.length) {
            throw new Error('Data arrays must have the same length');
        }

        this.data.setData(
            xValues,
            zValues,
            yValues,
            data.sample || 'custom',
            data.labels
        );

            return true;
        } catch (error) {
            throw new Error(`JSON import failed: ${error.message}`);
        }
    }

    importFromCSV(content) {
        try {
            const lines = content.split('\n');
            const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
            
            // Find column indices - support both generic and specific names
            const xIndex = headers.findIndex(h => h.includes('x') || h.includes('wave'));
            const zIndex = headers.findIndex(h => h.includes('z') || h.includes('time') || h.includes('retention'));
            const yIndex = headers.findIndex(h => h.includes('y') || h.includes('intensity') || h.includes('absorbance'));
            
            if (xIndex === -1 || zIndex === -1 || yIndex === -1) {
                throw new Error('CSV must contain X/wavelength, Z/time, and Y/intensity columns');
            }

            const xValues = [];
            const zValues = [];
            const yValues = [];

            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '') continue;
                
                const values = lines[i].split(',').map(v => v.trim());
                
                const x = parseFloat(values[xIndex]);
                const z = parseFloat(values[zIndex]);
                const y = parseFloat(values[yIndex]);
                
                if (!isNaN(x) && !isNaN(z) && !isNaN(y)) {
                    xValues.push(x);
                    zValues.push(z);
                    yValues.push(y);
                }
            }

            this.data.setData(xValues, zValues, yValues, 'custom');
            return true;
        } catch (error) {
            throw new Error(`CSV import failed: ${error.message}`);
        }
    }

    downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    downloadCanvas(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
} 