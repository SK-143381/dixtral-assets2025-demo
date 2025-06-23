// Logger.js - Configurable logging utility for production-ready code
export class Logger {
    static LogLevel = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    };

    constructor(namespace = 'App') {
        this.namespace = namespace;
    }

    // Global configuration - can be set from environment or config
    static config = {
        enabled: true,
        level: Logger.LogLevel.INFO, // Default to INFO level
        production: false, // Set to true in production builds
        timestamps: true,
        namespaces: true
    };

    /**
     * Configure the logger globally
     * @param {Object} options - Configuration options
     */
    static configure(options = {}) {
        Logger.config = { ...Logger.config, ...options };
    }

    /**
     * Set production mode - disables all logging except errors
     * @param {boolean} isProduction - Whether in production mode
     */
    static setProduction(isProduction = true) {
        Logger.config.production = isProduction;
        if (isProduction) {
            Logger.config.enabled = false; // Disable all logging in production
            Logger.config.level = Logger.LogLevel.ERROR; // Only errors in production
        }
    }

    /**
     * Create a logger instance for a specific namespace
     * @param {string} namespace - Namespace for the logger (e.g., 'UIController', 'Engine')
     * @returns {Logger} Logger instance
     */
    static create(namespace) {
        return new Logger(namespace);
    }

    /**
     * Format log message with timestamp and namespace
     * @param {string} level - Log level string
     * @param {*} args - Arguments to log
     * @returns {Array} Formatted arguments
     */
    _formatMessage(level, ...args) {
        const parts = [];
        
        if (Logger.config.timestamps) {
            parts.push(`[${new Date().toISOString()}]`);
        }
        
        if (Logger.config.namespaces && this.namespace) {
            parts.push(`[${this.namespace}]`);
        }
        
        parts.push(`[${level}]`);
        
        return parts.concat(args);
    }

    /**
     * Log at DEBUG level
     * @param {...*} args - Arguments to log
     */
    debug(...args) {
        if (!Logger.config.enabled || Logger.config.level < Logger.LogLevel.DEBUG) {
            return;
        }
        console.log(...this._formatMessage('DEBUG', ...args));
    }

    /**
     * Log at INFO level
     * @param {...*} args - Arguments to log
     */
    info(...args) {
        if (!Logger.config.enabled || Logger.config.level < Logger.LogLevel.INFO) {
            return;
        }
        console.log(...this._formatMessage('INFO', ...args));
    }

    /**
     * Log at WARN level
     * @param {...*} args - Arguments to log
     */
    warn(...args) {
        if (!Logger.config.enabled || Logger.config.level < Logger.LogLevel.WARN) {
            return;
        }
        console.warn(...this._formatMessage('WARN', ...args));
    }

    /**
     * Log at ERROR level (always shown, even in production)
     * @param {...*} args - Arguments to log
     */
    error(...args) {
        if (!Logger.config.enabled && !Logger.config.production) {
            return;
        }
        // Always show errors, even in production
        console.error(...this._formatMessage('ERROR', ...args));
    }

    /**
     * Log performance metrics
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} metadata - Additional metadata
     */
    performance(operation, duration, metadata = {}) {
        if (!Logger.config.enabled || Logger.config.level < Logger.LogLevel.DEBUG) {
            return;
        }
        this.debug(`Performance: ${operation} took ${duration}ms`, metadata);
    }

    /**
     * Create a performance timer
     * @param {string} operation - Operation name
     * @returns {Function} End timer function
     */
    startTimer(operation) {
        const start = performance.now();
        return (metadata = {}) => {
            const duration = performance.now() - start;
            this.performance(operation, duration.toFixed(2), metadata);
        };
    }

    /**
     * Log object inspection for debugging
     * @param {string} label - Label for the object
     * @param {*} obj - Object to inspect
     */
    inspect(label, obj) {
        if (!Logger.config.enabled || Logger.config.level < Logger.LogLevel.DEBUG) {
            return;
        }
        this.debug(`${label}:`, obj);
    }

    /**
     * Group related log messages
     * @param {string} label - Group label
     * @param {Function} fn - Function to execute within the group
     */
    group(label, fn) {
        if (!Logger.config.enabled || Logger.config.level < Logger.LogLevel.DEBUG) {
            fn && fn();
            return;
        }
        console.group(...this._formatMessage('GROUP', label));
        try {
            fn && fn();
        } finally {
            console.groupEnd();
        }
    }
}

// Create default logger instances for common use cases
export const AppLogger = Logger.create('App');
export const UILogger = Logger.create('UI');
export const EngineLogger = Logger.create('Engine');
export const DataLogger = Logger.create('Data');
export const AccessibilityLogger = Logger.create('Accessibility');

// Configure based on environment
if (typeof window !== 'undefined') {
    // Browser environment - check for debug mode
    const isDebug = window.location.search.includes('debug=true') || 
                   window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1';
    
    Logger.configure({
        enabled: isDebug,
        level: isDebug ? Logger.LogLevel.DEBUG : Logger.LogLevel.WARN,
        production: !isDebug
    });
}

// Export for easy access
export default Logger; 