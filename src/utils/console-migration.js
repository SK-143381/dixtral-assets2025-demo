// console-migration.js - Helper script to migrate console statements to Logger
// This is a development utility to help replace console statements
// Run this in the browser console to see remaining console statements

function findConsoleStatements() {
    const consolePattern = /console\.(log|warn|error|info|debug)\s*\(/g;
    const results = [];
    
    // This would need to be run with a file processing tool
    // For now, it serves as documentation for the migration pattern
    
    return {
        migrations: [
            {
                pattern: /console\.log\(\s*(['"`])?(.*?)\1?\s*\)/g,
                replacement: (match, file, quote, logMessage) => {
                    const logger = getLoggerForFile(file);
                    return logMessage && (logMessage.includes('[DEBUG]') || logMessage.includes('[debug]')) 
                        ? `${logger}.debug(${quote || ''}${logMessage}${quote || ''})` 
                        : `${logger}.info(${quote || ''}${logMessage}${quote || ''})`;
                }
            },
            {
                pattern: /console\.warn\(/g,
                replacement: (match, file) => `${getLoggerForFile(file)}.warn(`
            },
            {
                pattern: /console\.error\(/g,
                replacement: (match, file) => `${getLoggerForFile(file)}.error(`
            },
            {
                pattern: /console\.info\(/g,
                replacement: (match, file) => `${getLoggerForFile(file)}.info(`
            },
            {
                pattern: /console\.debug\(/g,
                replacement: (match, file) => `${getLoggerForFile(file)}.debug(`
            }
        ]
    };
}

function getLoggerForFile(filePath) {
    if (filePath.includes('/ui/')) return 'UILogger';
    if (filePath.includes('/core/')) return 'EngineLogger';
    if (filePath.includes('/accessibility/')) return 'AccessibilityLogger';
    if (filePath.includes('app.js') || filePath.includes('main.js')) return 'AppLogger';
    if (filePath.includes('/utils/')) return 'Logger.create("Utils")';
    if (filePath.includes('/shaders/')) return 'Logger.create("Shaders")';
    return 'Logger.create("Unknown")';
}

// Manual migration guide for remaining files
const migrationGuide = {
    imports: {
        'src/ui/': 'import { UILogger } from "../utils/Logger.js";',
        'src/core/': 'import { EngineLogger, DataLogger } from "../utils/Logger.js";',
        'src/accessibility/': 'import { AccessibilityLogger } from "../utils/Logger.js";',
        'src/shaders/': 'import Logger from "../utils/Logger.js";',
        'src/utils/': 'import Logger from "./Logger.js";'
    },
    
    patterns: {
        'console.log(': '→ Logger.info( or Logger.debug(',
        'console.warn(': '→ Logger.warn(',
        'console.error(': '→ Logger.error(',
        'console.info(': '→ Logger.info(',
        'console.debug(': '→ Logger.debug('
    },
    
    examples: {
        'Debug logs': 'console.log("[DEBUG] ...") → EngineLogger.debug("...")',
        'Info logs': 'console.log("Info message") → AppLogger.info("Info message")',
        'Error logs': 'console.error("Error") → Logger.error("Error")',
        'Warning logs': 'console.warn("Warning") → Logger.warn("Warning")'
    }
};

console.log('Console Migration Guide:', migrationGuide); 