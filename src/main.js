// main.js - Application entry point
import { SurfacePlotApplication } from './app.js';
import { AppLogger } from './utils/Logger.js';

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    AppLogger.info('Initializing Surface Plot Application...');
    
    const app = new SurfacePlotApplication();
    try {
        await app.initialize();
        AppLogger.info('Application initialized successfully');
    } catch (error) {
        AppLogger.error('Failed to initialize application:', error);
    }
}); 