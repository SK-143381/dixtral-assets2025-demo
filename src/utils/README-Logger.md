# Logger Utility Documentation

## Overview

The Logger utility provides a configurable, production-ready logging system that replaces direct `console.*` calls throughout the application. It supports different log levels, namespaces, and can be completely disabled in production builds.

## Features

- **Configurable Log Levels**: DEBUG, INFO, WARN, ERROR
- **Namespace Support**: Organize logs by component/module
- **Production Mode**: Automatically disable logging except errors
- **Performance Timing**: Built-in performance measurement tools
- **Environment Detection**: Auto-configure based on hostname/debug flags

## Usage

### Basic Usage

```javascript
import { AppLogger, UILogger, EngineLogger } from './utils/Logger.js';

// Use pre-configured loggers
AppLogger.info('Application started');
UILogger.debug('UI component initialized');
EngineLogger.error('WebGL context failed');

// Create custom logger
import Logger from './utils/Logger.js';
const MyLogger = Logger.create('MyComponent');
MyLogger.warn('Custom warning message');
```

### Available Log Levels

```javascript
// DEBUG - Detailed diagnostic information
logger.debug('Detailed debug info', { data: someObject });

// INFO - General information 
logger.info('Process completed successfully');

// WARN - Warning conditions
logger.warn('Deprecated API usage detected');

// ERROR - Error conditions (always shown, even in production)
logger.error('Critical error occurred', error);
```

### Performance Monitoring

```javascript
// Performance timing
const timer = logger.startTimer('data-processing');
// ... do work ...
timer({ recordsProcessed: 1000 }); // Logs: "Performance: data-processing took 125.43ms"

// Direct performance logging
logger.performance('rendering', 16.67, { frames: 60 });
```

### Object Inspection

```javascript
// Debug object inspection
logger.inspect('User Data', userObject);

// Grouped logging
logger.group('Initialization Process', () => {
    logger.debug('Step 1: Loading config');
    logger.debug('Step 2: Setting up WebGL');
    logger.debug('Step 3: Creating buffers');
});
```

## Configuration

### Global Configuration

```javascript
import Logger from './utils/Logger.js';

// Configure globally
Logger.configure({
    enabled: true,
    level: Logger.LogLevel.DEBUG,
    production: false,
    timestamps: true,
    namespaces: true
});

// Set production mode (disables all logging except errors)
Logger.setProduction(true);
```

### Environment-Based Configuration

The logger automatically configures based on environment:

- **Development** (`localhost`, `127.0.0.1`, `?debug=true`): Full logging enabled
- **Production**: Only errors shown
- **Debug Mode** (`?debug=true` in URL): Full debug logging

## Log Levels

| Level | Value | Description | Production |
|-------|-------|-------------|------------|
| ERROR | 0 | Critical errors | ✅ Always shown |
| WARN  | 1 | Warning conditions | ❌ Hidden |
| INFO  | 2 | General information | ❌ Hidden |
| DEBUG | 3 | Detailed diagnostics | ❌ Hidden |

## Pre-configured Loggers

| Logger | Namespace | Usage |
|--------|-----------|-------|
| `AppLogger` | App | Main application logic |
| `UILogger` | UI | User interface components |
| `EngineLogger` | Engine | WebGL/rendering engine |
| `DataLogger` | Data | Data management |
| `AccessibilityLogger` | Accessibility | Accessibility features |

## Migration from console.*

### Import the Logger

```javascript
// Before
// No import needed

// After
import { AppLogger, UILogger, EngineLogger } from './utils/Logger.js';
```

### Replace console calls

```javascript
// Before
console.log('Debug info');
console.log('[DEBUG] Detailed info');
console.info('General info');
console.warn('Warning message');
console.error('Error message');

// After
AppLogger.debug('Debug info');
EngineLogger.debug('Detailed info');
AppLogger.info('General info');
AppLogger.warn('Warning message');
AppLogger.error('Error message');
```

## File-Specific Logger Selection

| File Location | Recommended Logger |
|--------------|-------------------|
| `src/app.js`, `src/main.js` | `AppLogger` |
| `src/ui/*.js` | `UILogger` |
| `src/core/*.js` | `EngineLogger` or `DataLogger` |
| `src/accessibility/*.js` | `AccessibilityLogger` |
| `src/shaders/*.js` | `Logger.create('Shaders')` |
| `src/utils/*.js` | `Logger.create('Utils')` |

## Benefits

### Development
- **Structured Logging**: Organized by namespace and level
- **Rich Context**: Timestamps, namespaces, and formatted output
- **Performance Monitoring**: Built-in timing capabilities
- **Debug Tools**: Object inspection and grouped logging

### Production
- **Zero Overhead**: Logging completely disabled except errors
- **Error Tracking**: Critical errors still logged for monitoring
- **Clean Console**: No development noise in production
- **Performance**: No string interpolation or object serialization overhead

## Implementation Status

### ✅ Completed Files
- `src/utils/Logger.js` - Core logger utility
- `src/main.js` - Application entry point
- `src/app.js` - Main application (partial)
- `src/core/PlotData.js` - Data management
- `src/core/VisualizationEngine.js` - Rendering engine (partial)
- `src/shaders/Shaders.js` - Shader compilation (errors converted to exceptions)

### 🔄 Remaining Files (Need Migration)
- `src/ui/UIController.js` (25+ console statements)
- `src/ui/MenuController.js` (19+ console statements)
- `src/ui/DarkModeController.js` (7+ console statements)
- `src/ui/AxesController.js` (45+ console statements)
- `src/accessibility/*.js` (Multiple files)
- Remaining debug logs in `src/core/VisualizationEngine.js`

## Next Steps

1. **Complete Migration**: Use the provided migration guide to update remaining files
2. **Add Imports**: Import appropriate loggers in each file
3. **Replace Calls**: Convert `console.*` to logger calls
4. **Test**: Verify logging works in development and is disabled in production
5. **Configure**: Adjust log levels for different environments

## Examples

### Before Migration
```javascript
// src/ui/UIController.js
console.log('UIController initialized');
console.warn('UIController already initialized, skipping...');
console.error('Failed to initialize UIController:', error);
```

### After Migration
```javascript
// src/ui/UIController.js
import { UILogger } from '../utils/Logger.js';

UILogger.info('UIController initialized');
UILogger.warn('UIController already initialized, skipping...');
UILogger.error('Failed to initialize UIController:', error);
```

## Production Deployment

For production deployment, ensure:

1. Set `Logger.setProduction(true)` or configure environment detection
2. Only critical errors will be logged
3. All debug/info/warn messages are suppressed
4. Performance overhead is eliminated

This provides a clean, professional logging system suitable for production applications while maintaining excellent debugging capabilities during development. 