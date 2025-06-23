/**
 * GamepadController.js
 * Manages gamepad input for navigating the 3D visualization.
 * Maps the left joystick to pan rotation controls, providing an alternative
 * input method for accessibility and user preference.
 */

export class GamepadController {
    constructor(visualizationEngine) {
        this.engine = visualizationEngine;
        this.isEnabled = true;
        this.isActive = false;
        this.animationFrameId = null;
        
        // Controller references for coordination (following NavigationController pattern)
        this.navigationController = null;
        this.textController = null;
        this.ttsController = null;
        
        // Sensitivity settings
        this.rotationSensitivity = 2.0; // How fast rotation responds to joystick input
        this.zoomSensitivity = 0.02; // How fast zoom responds to joystick input
        this.deadZone = 0.15; // Minimum joystick movement to register (prevents drift)
        
        // Track last known gamepad state
        this.lastGamepadState = {
            leftStickX: 0,
            leftStickY: 0,
            rightStickX: 0,
            rightStickY: 0
        };
        
        // Connected gamepad index (if any)
        this.gamepadIndex = -1;
        
        console.log('GamepadController initialized');
    }

    /**
     * Set controller references for coordination (following codebase pattern)
     * @param {NavigationController} navigationController - Navigation coordinator
     * @param {TextController} textController - Text display controller  
     * @param {TTSController} ttsController - Text-to-speech controller
     */
    setControllers(navigationController, textController, ttsController) {
        this.navigationController = navigationController;
        this.textController = textController;
        this.ttsController = ttsController;
    }

    /**
     * Initialize the gamepad controller
     */
    async initialize() {
        console.log('Initializing GamepadController...');
        
        // Set up gamepad event listeners
        this.setupGamepadEventListeners();
        
        // Set up keyboard shortcuts for testing/debugging
        this.setupDebugKeyboardShortcuts();
        
        // Initialize UI status indicator
        this.updateGamepadStatusUI();
        
        // Start polling for gamepad input
        this.startGamepadPolling();
        
        console.log('GamepadController initialized successfully');
    }

    /**
     * Set up event listeners for gamepad connection/disconnection
     */
    setupGamepadEventListeners() {
        window.addEventListener('gamepadconnected', (event) => {
            console.log(`Gamepad connected: ${event.gamepad.id}`);
            this.gamepadIndex = event.gamepad.index;
            this.isActive = true;
            
            // Update UI status
            this.updateGamepadStatusUI();
            
            // Announce gamepad connection if TTS is available
            this.announceGamepadStatus('Gamepad connected for plot navigation');
        });

        window.addEventListener('gamepaddisconnected', (event) => {
            console.log(`Gamepad disconnected: ${event.gamepad.id}`);
            if (event.gamepad.index === this.gamepadIndex) {
                this.gamepadIndex = -1;
                this.isActive = false;
                
                // Update UI status
                this.updateGamepadStatusUI();
                
                // Announce gamepad disconnection
                this.announceGamepadStatus('Gamepad disconnected');
            }
        });
    }

    /**
     * Set up keyboard shortcuts for testing and debugging gamepad features
     */
    setupDebugKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Ctrl+G: Check gamepad status
            if (event.ctrlKey && event.key.toLowerCase() === 'g') {
                event.preventDefault();
                this.logGamepadStatus();
            }
            
            // Ctrl+Shift+G: Toggle gamepad enabled/disabled
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'g') {
                event.preventDefault();
                this.setEnabled(!this.isEnabled);
            }
        });
    }

    /**
     * Start polling for gamepad input using requestAnimationFrame
     */
    startGamepadPolling() {
        const pollGamepad = () => {
            if (this.isEnabled && this.isActive && this.gamepadIndex >= 0) {
                this.updateFromGamepad();
            }
            
            this.animationFrameId = requestAnimationFrame(pollGamepad);
        };
        
        pollGamepad();
    }

    /**
     * Update visualization based on current gamepad input
     */
    updateFromGamepad() {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[this.gamepadIndex];
        
        if (!gamepad) {
            return;
        }

        // Get left stick axes (typically axes 0 and 1)
        const leftStickX = gamepad.axes[0] || 0; // Horizontal movement
        const leftStickY = gamepad.axes[1] || 0; // Vertical movement
        
        // Get right stick axes (typically axes 2 and 3)
        const rightStickX = gamepad.axes[2] || 0; // Horizontal movement (unused for now)
        const rightStickY = gamepad.axes[3] || 0; // Vertical movement (zoom)

        // Apply dead zone to prevent unwanted movement from stick drift
        const filteredLeftX = Math.abs(leftStickX) > this.deadZone ? leftStickX : 0;
        const filteredLeftY = Math.abs(leftStickY) > this.deadZone ? leftStickY : 0;
        const filteredRightX = Math.abs(rightStickX) > this.deadZone ? rightStickX : 0;
        const filteredRightY = Math.abs(rightStickY) > this.deadZone ? rightStickY : 0;

        // Handle rotation with left stick
        if (filteredLeftX !== 0 || filteredLeftY !== 0) {
            // Map joystick input to rotation
            // Left stick X controls Y rotation (horizontal panning)
            // Left stick Y controls X rotation (vertical panning)
            const deltaRotationY = filteredLeftX * this.rotationSensitivity;
            const deltaRotationX = filteredLeftY * this.rotationSensitivity;
            
            // Update the visualization engine's rotation
            this.engine.rotationY += deltaRotationY;
            this.engine.rotationX += deltaRotationX;
            
            // Clamp rotation X to avoid flipping (same constraint as mouse controls)
            this.engine.rotationX = Math.max(-90, Math.min(90, this.engine.rotationX));
            
            // Clamp rotation Y to stay within reasonable bounds (but allow continuous rotation)
            // Normalize Y rotation to -180 to 180 range for UI compatibility
            while (this.engine.rotationY > 180) {
                this.engine.rotationY -= 360;
            }
            while (this.engine.rotationY < -180) {
                this.engine.rotationY += 360;
            }
        }
        
        // Handle zoom with right stick Y-axis
        if (filteredRightY !== 0) {
            // Right stick up (negative value) = zoom in
            // Right stick down (positive value) = zoom out
            const deltaZoom = -filteredRightY * this.zoomSensitivity;
            
            // Update the visualization engine's zoom
            this.engine.zoom += deltaZoom;
            
            // Clamp zoom to reasonable bounds (same as UI constraints)
            this.engine.zoom = Math.max(0.1, Math.min(2.0, this.engine.zoom));
        }
        
        // Debug logging
        if (Math.abs(filteredLeftX) > 0 || Math.abs(filteredLeftY) > 0 || Math.abs(filteredRightY) > 0) {
            console.log(`Gamepad input - LeftStick: X=${filteredLeftX.toFixed(3)}, Y=${filteredLeftY.toFixed(3)}, RightStick: Y=${filteredRightY.toFixed(3)}`);
            console.log(`Delta rotation - Y=${(filteredLeftX * this.rotationSensitivity).toFixed(3)}, X=${(filteredLeftY * this.rotationSensitivity).toFixed(3)}, Zoom=${(-filteredRightY * this.zoomSensitivity).toFixed(3)}`);
            console.log(`Engine state - RotX: ${this.engine.rotationX.toFixed(1)}, RotY: ${this.engine.rotationY.toFixed(1)}, Zoom: ${this.engine.zoom.toFixed(2)}`);
        }
        
        // Update the UI controls to reflect the new values
        this.updateUIControls();

        // Store current state for future reference
        this.lastGamepadState.leftStickX = leftStickX;
        this.lastGamepadState.leftStickY = leftStickY;
        this.lastGamepadState.rightStickX = rightStickX;
        this.lastGamepadState.rightStickY = rightStickY;
    }

    /**
     * Update UI control sliders to reflect current rotation and zoom values
     */
    updateUIControls() {
        const rotationXSlider = document.getElementById('rotationX');
        const rotationYSlider = document.getElementById('rotationY');
        const zoomSlider = document.getElementById('zoom');
        const rotationXValue = document.getElementById('rotationXValue');
        const rotationYValue = document.getElementById('rotationYValue');
        const zoomValue = document.getElementById('zoomValue');
        
        if (rotationXSlider) {
            // Clamp to slider range for display only - don't trigger events
            const clampedX = Math.max(-180, Math.min(180, this.engine.rotationX));
            rotationXSlider.value = clampedX;
            
            // Update display value directly
            if (rotationXValue) {
                rotationXValue.textContent = clampedX.toFixed(0) + '°';
            }
        }
        
        if (rotationYSlider) {
            // Clamp to slider range for display only - don't trigger events
            const clampedY = Math.max(-180, Math.min(180, this.engine.rotationY));
            rotationYSlider.value = clampedY;
            
            // Update display value directly
            if (rotationYValue) {
                rotationYValue.textContent = clampedY.toFixed(0) + '°';
            }
        }
        
        if (zoomSlider) {
            // Update zoom slider to reflect current zoom level
            zoomSlider.value = this.engine.zoom;
            
            // Update display value directly
            if (zoomValue) {
                zoomValue.textContent = this.engine.zoom.toFixed(1) + 'x';
            }
        }
    }

    /**
     * Create and update gamepad status indicator in the UI
     */
    updateGamepadStatusUI() {
        let statusElement = document.getElementById('gamepad-status');
        
        if (!statusElement) {
            // Create the status element if it doesn't exist
            statusElement = document.createElement('div');
            statusElement.id = 'gamepad-status';
            statusElement.className = 'gamepad-status';
            statusElement.style.cssText = `
                margin: 8px 0;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                text-align: center;
                border: 1px solid;
                transition: all 0.3s ease;
            `;
            
            // Add to navigation info area
            const navInfo = document.getElementById('navigationInfo');
            if (navInfo) {
                navInfo.appendChild(statusElement);
            }
        }
        
        // Update status appearance and text
        if (this.isActive && this.gamepadIndex >= 0) {
            statusElement.textContent = '🎮 Gamepad Connected';
            statusElement.style.backgroundColor = '#d4edda';
            statusElement.style.color = '#155724';
            statusElement.style.borderColor = '#c3e6cb';
        } else if (this.isEnabled) {
            statusElement.textContent = '🎮 Gamepad Ready (None Connected)';
            statusElement.style.backgroundColor = '#fff3cd';
            statusElement.style.color = '#856404';
            statusElement.style.borderColor = '#ffeaa7';
        } else {
            statusElement.textContent = '🎮 Gamepad Disabled';
            statusElement.style.backgroundColor = '#f8d7da';
            statusElement.style.color = '#721c24';
            statusElement.style.borderColor = '#f5c6cb';
        }
    }

    /**
     * Enable or disable gamepad control
     * @param {boolean} enabled - Whether gamepad control should be enabled
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`GamepadController ${enabled ? 'enabled' : 'disabled'}`);
        
        // Update UI status
        this.updateGamepadStatusUI();
        
        // Announce state change
        this.announceGamepadStatus(`Gamepad control ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Adjust the sensitivity of gamepad rotation control
     * @param {number} sensitivity - New sensitivity value (recommended range: 0.5 - 5.0)
     */
    setRotationSensitivity(sensitivity) {
        this.rotationSensitivity = Math.max(0.1, Math.min(10.0, sensitivity));
        console.log(`Gamepad rotation sensitivity set to ${this.rotationSensitivity}`);
        
        this.announceGamepadStatus(`Gamepad sensitivity set to ${this.rotationSensitivity.toFixed(1)}`);
    }

    /**
     * Adjust the sensitivity of gamepad zoom control
     * @param {number} sensitivity - New sensitivity value (recommended range: 0.01 - 0.1)
     */
    setZoomSensitivity(sensitivity) {
        this.zoomSensitivity = Math.max(0.005, Math.min(0.2, sensitivity));
        console.log(`Gamepad zoom sensitivity set to ${this.zoomSensitivity}`);
        
        this.announceGamepadStatus(`Gamepad zoom sensitivity set to ${this.zoomSensitivity.toFixed(3)}`);
    }

    /**
     * Adjust the dead zone for the gamepad joystick
     * @param {number} deadZone - New dead zone value (recommended range: 0.05 - 0.3)
     */
    setDeadZone(deadZone) {
        this.deadZone = Math.max(0.0, Math.min(0.5, deadZone));
        console.log(`Gamepad dead zone set to ${this.deadZone}`);
    }

    /**
     * Get current gamepad connection status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isEnabled: this.isEnabled,
            isActive: this.isActive,
            isConnected: this.gamepadIndex >= 0,
            gamepadIndex: this.gamepadIndex,
            rotationSensitivity: this.rotationSensitivity,
            zoomSensitivity: this.zoomSensitivity,
            deadZone: this.deadZone
        };
    }

    /**
     * Announce gamepad status changes using TTS if available
     * @param {string} message - Message to announce
     */
    announceGamepadStatus(message) {
        // Use direct controller reference if available (following codebase pattern)
        if (this.ttsController && this.ttsController.isEnabled) {
            this.ttsController.speak(message);
        } else {
            // Fallback to event dispatch for backward compatibility
            try {
                document.dispatchEvent(new CustomEvent('gamepad-status-announcement', {
                    detail: { message }
                }));
            } catch (error) {
                console.log('Could not announce gamepad status:', error);
            }
        }
    }

    /**
     * Log current gamepad status to console and announce via TTS
     */
    logGamepadStatus() {
        const status = this.getStatus();
        const gamepads = navigator.getGamepads();
        const connectedGamepads = Array.from(gamepads).filter(gp => gp !== null);
        
        console.log('=== Gamepad Status ===');
        console.log('Enabled:', status.isEnabled);
        console.log('Active:', status.isActive);
        console.log('Connected:', status.isConnected);
        console.log('Gamepad Index:', status.gamepadIndex);
        console.log('Rotation Sensitivity:', status.rotationSensitivity);
        console.log('Zoom Sensitivity:', status.zoomSensitivity);
        console.log('Dead Zone:', status.deadZone);
        console.log('Connected Gamepads:', connectedGamepads.length);
        console.log('Current Engine State - RotX:', this.engine.rotationX.toFixed(1), 'RotY:', this.engine.rotationY.toFixed(1), 'Zoom:', this.engine.zoom.toFixed(2));
        
        if (connectedGamepads.length > 0) {
            connectedGamepads.forEach((gamepad, index) => {
                console.log(`  Gamepad ${index}: ${gamepad.id}`);
                console.log(`    Axes: [${gamepad.axes.map(a => a.toFixed(3)).join(', ')}]`);
                console.log(`    Buttons: ${gamepad.buttons.length} buttons`);
                
                // Show current stick values
                if (gamepad.axes.length >= 2) {
                    const leftStickX = gamepad.axes[0] || 0;
                    const leftStickY = gamepad.axes[1] || 0;
                    console.log(`    Left stick: X=${leftStickX.toFixed(3)}, Y=${leftStickY.toFixed(3)}`);
                    console.log(`    After dead zone: X=${Math.abs(leftStickX) > this.deadZone ? leftStickX.toFixed(3) : '0.000'}, Y=${Math.abs(leftStickY) > this.deadZone ? leftStickY.toFixed(3) : '0.000'}`);
                }
                
                if (gamepad.axes.length >= 4) {
                    const rightStickX = gamepad.axes[2] || 0;
                    const rightStickY = gamepad.axes[3] || 0;
                    console.log(`    Right stick: X=${rightStickX.toFixed(3)}, Y=${rightStickY.toFixed(3)}`);
                    console.log(`    After dead zone: X=${Math.abs(rightStickX) > this.deadZone ? rightStickX.toFixed(3) : '0.000'}, Y=${Math.abs(rightStickY) > this.deadZone ? rightStickY.toFixed(3) : '0.000'}`);
                }
            });
        }
        
        // Announce status
        let statusMessage = `Gamepad controller ${status.isEnabled ? 'enabled' : 'disabled'}. `;
        if (connectedGamepads.length > 0) {
            statusMessage += `${connectedGamepads.length} gamepad${connectedGamepads.length > 1 ? 's' : ''} connected. `;
            if (status.isActive) {
                statusMessage += `Currently using ${connectedGamepads[status.gamepadIndex]?.id || 'unknown gamepad'} for navigation. Left joystick controls rotation, right joystick controls zoom.`;
            }
        } else {
            statusMessage += 'No gamepads connected.';
        }
        
        this.announceGamepadStatus(statusMessage);
    }

    /**
     * Clean up resources and stop polling
     */
    dispose() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.isActive = false;
        this.gamepadIndex = -1;
        
        console.log('GamepadController disposed');
    }
}
