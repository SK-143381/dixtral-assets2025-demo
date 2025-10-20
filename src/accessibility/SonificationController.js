// Logger will be injected by NavigationController

export class SonificationController {
    constructor(dataController = null, textController = null) {
        this.audioContext = null;
        this.isEnabled = true; // Sonification enabled by default
        this.boundaryAudioBuffer = null; // For storing the boundary sound WAV file
        
        // Dependencies
        this.dataController = dataController;
        this.textController = textController;
        this.highlightController = null; // For visual highlighting
        this.navigationController = null; // For segment highlighting synchronization
        this.logger = null; // Will be injected by NavigationController
    }
    
    /**
     * Set dependencies after construction (called by NavigationController)
     */
    setDependencies(dataController, textController, highlightController = null, navigationController = null, logger = null) {
        this.dataController = dataController;
        this.textController = textController;
        this.highlightController = highlightController;
        this.navigationController = navigationController;
        this.logger = logger;
    }

    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.setupAudioNodes();
            await this.loadBoundarySound(); // Load the boundary sound WAV file
            this.logger?.debug('SonificationController initialized successfully');
        } catch (error) {
            this.logger?.warn('Audio context not available:', error);
            // Continue without audio - this is not a critical failure
        }
    }

    async loadBoundarySound() {
        try {
            this.logger?.debug('Loading boundary sound...');
            const response = await fetch('src/audio/boundary-sound.wav');
            if (!response.ok) {
                throw new Error(`Failed to fetch boundary sound: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            this.boundaryAudioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.logger?.debug('Boundary sound loaded successfully');
        } catch (error) {
            this.logger?.warn('Failed to load boundary sound WAV file:', error);
            this.logger?.debug('Will fall back to synthesized boundary sound');
        }
    }

    // Setup audio nodes for sonification
    setupAudioNodes() {
        if (!this.audioContext) return;
        
        // Create a simple oscillator for testing
        this.oscillator = this.audioContext.createOscillator();
        this.gainNode = this.audioContext.createGain();
        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        this.oscillator.start();
        this.oscillator.stop(); // Stop it immediately, we'll start it when needed
    }

    // Toggle sonification on/off
    toggleEnabled() {
        this.isEnabled = !this.isEnabled;
        this.logger?.debug('Sonification', this.isEnabled ? 'enabled' : 'disabled');
        
        // Note: Autoplay now managed by AutoPlayController
        
        // Clear highlighting if disabling sonification
        if (!this.isEnabled && this.highlightController) {
            // Clear any current highlighting
            this.highlightController.clearHighlight();
            this.highlightController.clearWireframeHighlight();
            this.highlightController.setWireframeHighlightEnabled(false);
        }
        
        // Announce the state change if possible
        if (this.textController) {
            const message = `Sonification ${this.isEnabled ? 'enabled' : 'disabled'}`;
            this.textController.announceToScreenReader(message);
        }
    }

    // Note: Autoplay functionality moved to AutoPlayController.js

    /**
     * Play data sonification based on point's Y value
     * @param {Object} point - The data point containing x, y, z values
     */
    sonifyPointByYValue(point) {
        if (!this.audioContext || !point || !this.isEnabled) return;

        // Get data range from the application data for dynamic mapping
        const dataRange = this.dataController ? this.dataController.getDataRange() : { 
            x: { min: 120, max: 200 }, 
            y: { min: 0, max: 3 }, 
            z: { min: 0, max: 10 } 
        };
        
        // Primary mapping: Y value to frequency (150-400 Hz range - lower for comfort)
        const minFreq = 150;
        const maxFreq = 400;
        const normalizedY = Math.max(0, Math.min(1, (point.y - dataRange.y.min) / (dataRange.y.max - dataRange.y.min)));
        const frequency = minFreq + normalizedY * (maxFreq - minFreq);
        
        // Secondary mapping: X value affects oscillator type/timbre - using gentler waveforms
        const normalizedX = Math.max(0, Math.min(1, (point.x - dataRange.x.min) / (dataRange.x.max - dataRange.x.min)));
        const oscillatorTypes = ['sine', 'triangle']; // Only gentle waveforms - removed harsh sawtooth and square
        const typeIndex = Math.floor(normalizedX * (oscillatorTypes.length - 0.01)); // Avoid overflow
        const oscillatorType = oscillatorTypes[typeIndex];
        
        // Tertiary mapping: Z value affects duration and volume envelope - gentler settings
        const normalizedZ = Math.max(0, Math.min(1, (point.z - dataRange.z.min) / (dataRange.z.max - dataRange.z.min)));
        const duration = 0.15 + normalizedZ * 0.25; // 0.15s to 0.4s duration (shorter for less fatigue)
        // Much higher minimum volume (0.7) with smaller dynamic range to ensure low values are audible
        const volume = 0.7 + normalizedY * 0.2;
        
        // Create oscillator and gain nodes
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Configure oscillator
        oscillator.type = oscillatorType;
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        
        // Create smooth envelope with variable duration
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        // Connect audio nodes
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Play the sound
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
        
        AccessibilityLogger.debug(`Sonified point - Y:${point.y.toFixed(2)} -> freq:${frequency.toFixed(0)}Hz, type:${oscillatorType}, duration:${duration.toFixed(2)}s`);
    }

    /**
     * Generic data sonification method for wireframe and other uses
     * @param {number} dataValue - The primary data value to sonify
     * @param {number} duration - Duration of the sound in seconds (optional)
     * @param {number} baseFreq - Base frequency to start from (optional)
     */
    playDataSonification(dataValue, duration = 0.3, baseFreq = 200) {
        this.logger?.debug(`playDataSonification called with: dataValue=${dataValue}, duration=${duration}, baseFreq=${baseFreq}`);
        this.logger?.debug('Audio context exists:', !!this.audioContext);
        this.logger?.debug('Sonification enabled:', this.isEnabled);
        
        if (!this.audioContext || !this.isEnabled) {
            this.logger?.debug('Sonification aborted - audio context missing or disabled');
            return;
        }

        // Get data range for normalization
        const yRange = this.dataController ? this.dataController.getDataRange().y : { min: 0, max: 3 };
        
        this.logger?.debug('Data range for normalization:', yRange);
        this.logger?.debug('Raw data value:', dataValue);
        
        // Robust normalization with fallback for edge cases
        let normalizedValue;
        if (yRange.max === yRange.min) {
            // Handle case where all Y values are the same
            normalizedValue = 0.5;
        } else {
            normalizedValue = (dataValue - yRange.min) / (yRange.max - yRange.min);
            // Clamp to 0-1 range but also ensure we don't lose information
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        }
        
        // Map to frequency range (150-400 Hz - lower for comfort)
        const minFreq = 150;
        const maxFreq = 400;
        const frequency = minFreq + normalizedValue * (maxFreq - minFreq);
        
        // Even higher minimum volume for surface/wireframe mode to ensure squares are clearly audible
    const minVolume = 0.85;
    const maxVolume = 1.0;
    let volume = minVolume + normalizedValue * (maxVolume - minVolume);
        
        this.logger?.debug(`Calculated: normalizedValue=${normalizedValue}, frequency=${frequency}Hz, volume=${volume}`);
        
        try {
            // Validate calculated values
            if (isNaN(frequency) || frequency < 20 || frequency > 20000) {
                this.logger?.warn('Invalid frequency calculated, using fallback:', frequency);
                // Fallback frequency based on data value directly
                const fallbackFreq = 200 + (Math.abs(dataValue) % 10) * 50;
                this.logger?.debug('Using fallback frequency:', fallbackFreq);
                return this.playFallbackSound(fallbackFreq, volume, duration);
            }
            
            if (isNaN(volume) || volume <= 0) {
                this.logger?.warn('Invalid volume calculated, using fallback:', volume);
                volume = 0.4; // Use a safe default volume
            }
            
            // Create oscillator and gain nodes
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            // Configure oscillator with sine wave for wireframe navigation
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            
            // Create smooth envelope - use linear ramp to avoid exponential ramp issues with low volumes
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
            
            // Connect and play
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + duration);
            
            this.logger?.debug('Sound successfully generated and scheduled');
        } catch (error) {
            this.logger?.error('Error generating sound:', error);
            // Try fallback sound
            this.playFallbackSound(300, 0.4, duration);
        }
    }

    /**
     * Fallback sound generation method when normal calculations fail
     * @param {number} frequency - Frequency to play
     * @param {number} volume - Volume level
     * @param {number} duration - Duration in seconds
     */
    playFallbackSound(frequency, volume, duration) {
        if (!this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.02);
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + duration);
            
            this.logger?.debug('Fallback sound played successfully');
        } catch (error) {
            this.logger?.error('Even fallback sound failed:', error);
        }
    }

    // Sonification methods
    sonifyCurrentPoint(point) {
        if (!this.audioContext || !point || !this.isEnabled) return;

        // Create a new oscillator for each point
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Map X coordinate to frequency (200-800 Hz range)
        // Get data range from the application data for dynamic mapping
        const dataRange = this.dataController ? this.dataController.getDataRange() : { 
            x: { min: 120, max: 200 }, 
            y: { min: 0, max: 3 } 
        };
        const xRange = dataRange.x;
        const minFreq = 200;
        const maxFreq = 800;
        
        const frequency = minFreq + (point.x - xRange.min) * (maxFreq - minFreq) / (xRange.max - xRange.min);
        
        // Map Y coordinate to volume (0.1-1.0 range)
        const yRange = dataRange.y;
        const volume = 0.1 + ((point.y - yRange.min) / (yRange.max - yRange.min)) * 0.9;
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }

    // Play a boundary sound using the loaded WAV file
    playBoundarySound() {
        this.logger?.debug('playBoundarySound called - checking conditions...');
        this.logger?.debug('Audio context exists:', !!this.audioContext);
        this.logger?.debug('Sonification enabled:', this.isEnabled);
        this.logger?.debug('Boundary audio buffer loaded:', !!this.boundaryAudioBuffer);
        
        if (!this.audioContext || !this.isEnabled) {
            this.logger?.debug('Boundary sound aborted - audio context missing or disabled');
            return;
        }
        
        try {
            if (this.boundaryAudioBuffer) {
                // Use the loaded WAV file
                this.playBoundaryWavSound();
                this.logger?.debug('Boundary WAV sound played successfully');
            } else {
                // Fall back to synthesized sound if WAV file didn't load
                this.logger?.debug('Falling back to synthesized boundary sound');
                this.playTableBeat(0); // First beat immediately
                this.playTableBeat(0.15); // Second beat after 0.15 seconds
                this.logger?.debug('Boundary sound (double tabla beats) played successfully');
            }
        } catch (error) {
            this.logger?.error('Error playing boundary sound:', error);
        }
    }

    // Play the boundary sound using the loaded WAV file
    playBoundaryWavSound() {
        if (!this.boundaryAudioBuffer || !this.audioContext) {
            return;
        }

        try {
            // Create audio source node for the WAV file
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            // Set up the audio buffer
            source.buffer = this.boundaryAudioBuffer;
            
            // Set volume (0.5 for reasonable level)
            gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
            
            // Connect nodes
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Play the sound
            source.start();
            
            this.logger?.debug('Boundary WAV sound started playing');
        } catch (error) {
            this.logger?.error('Error playing boundary WAV sound:', error);
            // Fall back to synthesized sound
            this.playTableBeat(0);
        }
    }

    // Helper method to play a single tabla-like beat
    playTableBeat(delay) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Use sine wave for clean drum-like tone
        oscillator.type = 'sine';
        
        // Fixed frequency - no sweep, just like a real drum
        oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime + delay); // Stable frequency
        
        // Real drum envelope: sharp attack, exponential decay
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime + delay);
        gainNode.gain.linearRampToValueAtTime(0.35, this.audioContext.currentTime + delay + 0.01); // Very sharp attack
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + delay + 0.08); // Natural decay
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Play the drum beat
        oscillator.start(this.audioContext.currentTime + delay);
        oscillator.stop(this.audioContext.currentTime + delay + 0.08);
    }

    /**
     * Cleanup method
     */
    destroy() {
        // Clear any remaining highlighting
        if (this.highlightController) {
            this.highlightController.clearHighlight();
            this.highlightController.clearWireframeHighlight();
            this.highlightController.setWireframeHighlightEnabled(false);
        }
        
        // Clean up audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        AccessibilityLogger.debug('SonificationController destroyed and cleaned up');
    }
}