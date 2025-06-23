export class TTSController {
    constructor() {
        this.isEnabled = false; // Default to disabled
        this.speechSynthesis = window.speechSynthesis;
        this.currentUtterance = null;
        this.setupKeyboardControls();
    }

    initialize() {
        // TTSController initialization is handled in constructor
        console.log('TTSController initialized');
    }

    setupKeyboardControls() {
        document.removeEventListener('keydown', this.handleKeyDown);
        
        this.handleKeyDown = (event) => {
            if (event.key.toLowerCase() === 'c') {
                event.preventDefault();
                this.toggleTTS();
            }
        };

        document.addEventListener('keydown', this.handleKeyDown);
    }

    toggleTTS() {
        this.isEnabled = !this.isEnabled;
        if (!this.isEnabled) {
            this.stopSpeech();
        }
        
        // Announce the state change
        const announcement = this.isEnabled ? 'Built-in TTS on' : 'Built-in TTS off';
        this.speak(announcement, true); // Use point announcement to force speaking
        
        // Dispatch event for UI update
        document.dispatchEvent(new CustomEvent('tts-state-changed', { 
            detail: { isEnabled: this.isEnabled }
        }));
    }

    speak(text, isPointAnnouncement = false, rate = 1.0) {
        // Allow point announcements even when TTS is disabled
        if (!this.isEnabled && !isPointAnnouncement) return;
        
        // Stop any ongoing speech
        this.stopSpeech();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        this.currentUtterance = utterance;
        this.speechSynthesis.speak(utterance);
    }

    stopSpeech() {
        if (this.speechSynthesis) {
            this.speechSynthesis.cancel();
            this.currentUtterance = null;
        }
    }
} 