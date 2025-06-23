// Event constants for consistent event naming across the application
export const EVENTS = {
    // Data events
    DATA_LABELS_CHANGED: 'data-labels-changed',
    SAMPLE_INFO_UPDATED: 'sample-info-updated',
    
    // UI events
    DISPLAY_MODE_CHANGED: 'display-mode-changed',
    DISPLAY_MODE_ANNOUNCEMENT_REQUESTED: 'display-mode-announcement-requested',
    LOAD_SELECTED_VARIABLES: 'load-selected-variables',
    CUSTOM_DATA_LOADED: 'custom-data-loaded',
    
    // Navigation events
    NAVIGATION_AXIS_TOGGLE_REQUESTED: 'navigation-axis-toggle-requested',
    NAVIGATION_AXIS_CHANGED: 'navigation-axis-changed',
    
    // Review mode events
    REVIEW_MODE_ENTERED: 'review-mode-entered',
    REVIEW_MODE_EXITED: 'review-mode-exited',
    REVIEW_MODE_TEXT_UPDATED: 'review-mode-text-updated',
    
    // Autoplay events
    AUTOPLAY_START_REQUESTED: 'autoplay-start-requested',
    AUTOPLAY_STOP_REQUESTED: 'autoplay-stop-requested',
    AUTOPLAY_STATE_CHANGED: 'autoplay-state-changed',
    
    // Application events
    SURFACE_PLOT_EXPORT_DATA: 'surface-plot-export-data',
    SURFACE_PLOT_EXPORT_IMAGE: 'surface-plot-export-image',
    SURFACE_PLOT_IMPORT_DATA: 'surface-plot-import-data',
    SURFACE_PLOT_LOAD_SAMPLE: 'surface-plot-load-sample',
    SURFACE_PLOT_LOAD_CUSTOM_DATA: 'surface-plot-load-custom-data',
    SURFACE_PLOT_FIND_PEAKS: 'surface-plot-find-peaks',
    SURFACE_PLOT_BASELINE_CORRECTION: 'surface-plot-baseline-correction',
    SURFACE_PLOT_SPECTRAL_DECONVOLUTION: 'surface-plot-spectral-deconvolution',
    SURFACE_PLOT_ERROR: 'surface-plot-error',
    
    // TTS events
    TTS_TOGGLE_REQUESTED: 'tts-toggle-requested',
    TTS_STATE_CHANGED: 'tts-state-changed',
    
    // Label announcement events
    ANNOUNCE_X_LABEL: 'announce-x-label',
    ANNOUNCE_Y_LABEL: 'announce-y-label',
    ANNOUNCE_Z_LABEL: 'announce-z-label'
}; 