# DIXTRAL
## Dynamic Interface eXploration of Three-dimensional Representations for Adaptive Learning

A modular, interactive WebGL-based 3D visualization platform with comprehensive accessibility features and universal data support. Built with a clean **5-layer modular architecture** for multiple plot types and production-ready logging system.

## 🏗️ Architecture Overview

### **5-Layer Modular Design**
```
┌─────────────────────────────────────────┐
│            Application Layer            │ ← Global Coordination
├─────────────────────────────────────────┤
│              UI Layer                   │ ← User Interface Components  
├─────────────────────────────────────────┤
│         Accessibility Layer             │ ← Universal Access Features
├─────────────────────────────────────────┤
│            Engine Layer                 │ ← WebGL Rendering Engine
├─────────────────────────────────────────┤
│              Data Layer                 │ ← Multi-Plot Data Management
└─────────────────────────────────────────┘
```

### **Component Hierarchy**
```
app.js (Application Controller)
├── UIController (UI Layer Coordinator)
│   ├── AxesController, DarkModeController, MenuController
├── NavigationController (Accessibility Coordinator)  
│   ├── SonificationController, TextController, TTSController
│   ├── GamepadController, HighlightController, ReviewModeController
├── VisualizationEngine (Universal Rendering)
└── PlotData (Universal Data Hub)
    ├── PlotDataFactory (Multi-Plot Support)
    ├── DescriptiveStatistics (Statistical Analysis)
    ├── Logger Utility (Production-Ready Logging)
    └── Plot Generators (Surface, Future: Scatter, Line)
```

## 🌟 Key Features

- **Multi-Plot Type Support**: Surface plots with extensible architecture
- **Advanced Navigation**: Automatic Y-segment based navigation with gap-jumping
- **Enhanced Wireframe Navigation**: Filled rectangle highlighting with spatial grid navigation
- **Multi-Dimensional Sonification**: Y-value-based audio feedback with frequency, timbre, and duration mapping
- **Universal Accessibility**: Screen readers, TTS, sonification, gamepad support
- **Review Mode**: Seamless focus switching between 3D plot and text field for screen reader users
- **Comprehensive Statistics**: Min/max, mean, median, mode, std dev, skewness
- **Multiple Data Formats**: CSV, JSON with automatic column detection
- **Real-Time Interaction**: Mouse, touch, keyboard controls
- **Production-Ready Logging**: Zero-overhead logger with namespace organization and environment-based configuration

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+), Modern WebGL browser

### Installation
```bash
git clone <repository-url>
cd webgl-try
npm install
npm run dev
```

Open `http://localhost:5173`

### First Experience
1. **Tab to canvas** → Navigation automatically activates
2. **H** → Open help menu
3. **S** → Toggle audio feedback
4. **T** → Cycle text display modes  
5. **V** → Toggle review mode for text-based plot information
6. **Arrow keys** → Navigate data points or wireframe rectangles

## 🎯 Controls Reference

### Navigation Controls
| Key | Function | Description |
|-----|----------|-------------|
| **Tab to canvas** | Activate navigation | Auto-enters application mode |
| **N** | Toggle navigation axis | Cycle Y→Z→X navigation modes |
| **↑/↓** | Y segment navigation | Move between data layers (Y mode) |
| **↑/↓** | Y coordinate movement | Move through Y values with same X,Z (X/Z modes) |
| **←/→** | X/Z dimension movement | Navigate within current segment/layer |
| **Ctrl+Shift+↑/↓** | Segment navigation | Move between segments (all modes) |
| **Enter** | Read current point/rectangle | Announce coordinates & values |

### Accessibility Controls
| Key | Function | Description |
|-----|----------|-------------|
| **S** | Toggle sonification | Y-value-based audio feedback on/off |
| **T** | Cycle text modes | Off → Verbose → Terse → Super Terse (works with screen readers) |
| **C** | Toggle TTS | Text-to-speech on/off |
| **V** | Toggle review mode | Automatically switches focus between plot and text field for screen readers |
| **X/Y/Z** | Announce axis labels | Hear axis names and units for each dimension |
| **A** | Toggle axis visibility | Show/hide 3D axes display |
| **1** | Surface mode | Switch to surface display mode |
| **2** | Points mode | Switch to points display mode |
| **F** | Cycle speech rates | 0.5x → 4.0x speed adjustment |
| **H** | Help menu | Open/close help system |
| **M** | Toggle theme | Dark/light mode |

### Advanced Controls
| Key | Function | Description |
|-----|----------|-------------|
| **Gamepad** | 3D navigation | Auto-detected controller support |
| **Mouse** | Rotate/zoom | Click drag + scroll wheel |
| **Touch** | Mobile interaction | Pinch zoom, drag rotate |

## 🧭 Navigation System

### **Multi-Axis Navigation Modes**
Press **N** to cycle between three navigation modes:

#### **Y-Axis Navigation** (Default)
- **↑/↓ Arrow Keys**: Move through Z dimension (higher/lower Z values)
- **←/→ Arrow Keys**: Move through X dimension within current Y segment
- **Ctrl+Shift+↑/↓**: Move between Y segments (different Y value ranges)
- **Data Grouping**: Points grouped by Y value ranges

#### **Z-Axis Navigation**
- **↑/↓ Arrow Keys**: Move through Y dimension **with constraint**
  - ✅ **Allowed**: Only when X and Z coordinates remain identical
  - ❌ **Blocked**: Plays boundary sound if X or Z coordinates would also change
- **←/→ Arrow Keys**: Move through X dimension within current Z segment
- **Ctrl+Shift+↑/↓**: Move between Z segments (different exact Z values)
- **Data Grouping**: Points grouped by exact Z values (dynamic segmentation)

#### **X-Axis Navigation**
- **↑/↓ Arrow Keys**: Move through Y dimension **with constraint**
  - ✅ **Allowed**: Only when X and Z coordinates remain identical
  - ❌ **Blocked**: Plays boundary sound if X or Z coordinates would also change
- **←/→ Arrow Keys**: Move through Z dimension within current X segment
- **Ctrl+Shift+↑/↓**: Move between X segments (different exact X values)
- **Data Grouping**: Points grouped by exact X values (dynamic segmentation)

### **Coordinate Constraint Logic**
In X and Z navigation modes, up/down movement follows strict coordinate rules:
- **Success Condition**: Next point has different Y value but **same X,Z coordinates** (±0.0001 tolerance)
- **Boundary Condition**: Next point requires changing X or Z coordinates → plays boundary sound
- **Smart Selection**: Finds closest Y value while maintaining X,Z position

## 📖 Review Mode for Screen Readers

### Seamless Focus Management
Review mode provides screen reader users with seamless access to textual plot information without losing their place in the 3D navigation.

**Key Features**:
- **V Key Toggle**: Press V from anywhere to enter/exit review mode
- **Automatic Focus**: Text field automatically receives focus when entering review mode
- **Navigation Preservation**: Your navigation position is remembered and restored when exiting
- **Bidirectional Exit**: Exit from either the text field (V key) or anywhere else (V key)
- **Audio Feedback**: Distinctive audio cues indicate focus transitions

**How It Works**:
1. **Enter Review Mode**: Press V while navigating the 3D plot
2. **Text Field Opens**: Automatically shows and focuses a text field with current plot information
3. **Screen Reader Navigation**: Use arrow keys to read through plot details line by line
4. **Return to Plot**: Press V again to hide text field and restore focus to the 3D plot
5. **Seamless Transition**: Your navigation position and state are preserved

**What's Included in Review Text**:
- Current position coordinates (X, Y, Z values with units)
- Navigation mode information (Y-axis, Z-axis, or X-axis mode)
- Current segment details and data context
- Statistical information for the current data region
- Wireframe navigation details (when in surface mode)

## 🎵 Enhanced Sonification System

### Y-Value-Based Audio Mapping
Each point/rectangle is sonified with multi-dimensional audio feedback:

- **Primary: Frequency (Pitch)** → Y value (200-1200 Hz)
  - Higher Y values = Higher pitch
- **Secondary: Timbre (Sound Character)** → X coordinate
  - Different positions = Different sound types (sine → triangle → sawtooth → square)
- **Tertiary: Duration** → Z coordinate (0.2-0.6 seconds)
- **Volume** → Also correlates with Y value for reinforcement

### Navigation Mode Audio Features
- **Point Navigation**: Rich multi-dimensional sonification
- **Wireframe Navigation**: Frequency-based sonification with yellow filled rectangle highlighting
- **Focus Audio Cues**: Ascending tones when entering, descending when leaving
- **Boundary Sounds**: Double-beep indicates navigation limits

## 📊 Sample Data

- **Benzene VUV Spectrum**: Real scientific data (3,118 points)
  - Wavelength (nm), Intensity (AU), Time (min)
- **Sinusoidal Surface**: Mathematical pattern (441 points)  
  - X Position, Height, Z Position (all in units)

## 📋 Data Formats

### CSV Format
```csv
X,Z,Y,Sample
120.0,0.1,0.05,my_data
```

### JSON Format  
```json
{
  "xValues": [120.0, 120.2],
  "zValues": [0.1, 0.1], 
  "yValues": [0.05, 0.07],
  "labels": {
    "xLabel": "Temperature", "xUnit": "°C",
    "yLabel": "Response", "yUnit": "mV", 
    "zLabel": "Time", "zUnit": "s"
  }
}
```

## 🏗️ Development Features

### Production-Ready Logger System
- **Environment Detection**: Automatically configures for development vs. production
- **Zero Overhead**: All logging disabled in production except critical errors
- **Namespace Organization**: AppLogger, UILogger, EngineLogger, DataLogger, AccessibilityLogger
- **Flexible Levels**: DEBUG, INFO, WARN, ERROR with configurable verbosity
- **Performance Monitoring**: Built-in timing utilities for optimization
- **Professional Deployment**: Clean production console without development noise

#### Developer Usage
```javascript
import { AppLogger, EngineLogger } from './utils/Logger.js';

// Replace console.log statements
AppLogger.debug('Application initialized');
EngineLogger.info('WebGL context created');
EngineLogger.error('Shader compilation failed', error);
```

#### Configuration
- **Development**: All logs visible on localhost or with `?debug=true`
- **Production**: Only ERROR level logs shown (automatic detection)
- **Migration Guide**: See `src/utils/README-Logger.md` for console statement migration

## 🔧 Architecture Details

For comprehensive architectural documentation, implementation details, extension patterns, and technical specifications, see **[architecture.md](./architecture.md)**.
