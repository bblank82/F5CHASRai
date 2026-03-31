# F5CHASRai — Development & Context Guide

This document serves as a persistent reference for the architectural decisions, design system, and current state of the **F5CHASRai** project.

---

## 🌪️ Project Vision
**F5CHASRai** is a specialized, field-ready meteorological web application designed for storm chasing and severe weather interception. It prioritizes **data density**, **visual clarity in low-light environments**, and **AI-assisted decision support**.

---

## 🎨 Design System

### Theme: "Field Agent" Dark
*   **Backgrounds**: Dark Grey/Charcoal (`#0a0a0a`, `#121212`, `#1a1a1a`).
*   **Accents**: Vibrant Orange (`#f59e0b`) for active states and critical data.
*   **Branding**: Purple (`#a855f7`) for "F5CHASR" and White (`#ffffff`) for "ai".
*   **Typography**: 
    *   `Inter`: Primary UI text.
    *   `JetBrains Mono`: Meteorological values and GPS data.

### UI Components
*   **Pill Toggle**: Modern button-based switch for **LIVE | ARCHIVE** modes.
*   **Accordion Sidebar**: Single-panel expansion system to maximize vertical space for Alerts, SPC outlooks, and Atmospheric Instability.
*   **Map System**: Leaflet-based map with high-contrast dark filtering and NWS/SPC layer overlays.
*   **Custom Indicators**: Minimalist CSS-based arrow toggles replace generic browser characters for a premium feel.

---

## 🛠️ Architecture & Modules

### Core Logic
*   **`src/main.js`**: Main entry point; handles app initialization and the single-panel accordion state.
*   **`src/modules/state.js`**: Central state management for time modes and user location.

### Specialized Features
*   **`src/modules/time_machine.js`**: Controls the transition between real-time data and historical archive playback.
*   **`src/modules/instability.js`**: Real-time atmospheric sounding analysis and visualization.
*   **`src/modules/storm_track.js`**: AI-driven intercept planner that calculates storm movement and suggests interception points.
*   **`src/modules/chat.js`**: Integration with Gemini (e.g., Gemini 2.0 Flash) for real-time meteorological assistance.

---

## 🚀 Development Workflow

### Quick Start
```bash
# Start the development server
npm run dev
```

### File Structure
*   `index.html`: Main layout and UI structure.
*   `src/style.css`: Centralized design system (variables, components, animations).
*   `src/modules/`: Feature-specific logic and data fetching.

---

## 📝 Recent Major Refinements
- **Branding Update**: Transitioned from "Storm Chaser" to "F5CHASRai" with dedicated styling.
- **Map Settings Evolution**: Implemented a multi-basemap engine (Dark Matter, Voyager Roads, Positron) with independent label brightness and contrast controls.
- **Alert Management**: Added a persistent filtering system for threat types and a high-contrast modal for technical alert text.
- **Conditions Overhaul**: Transformed the instability panel into a full-width conditions dashboard with horizontal parameter categorization for improved data density.
- **Radar Precision**: Relocated scan tilt controls to the primary map toolbar and implemented real-time intervalized timestamps for live radar tiles.

---

> [!TIP]
> **Field Usage**: The UI is optimized for a 320px right-panel width. If using on a tablet, the map and chat layers are designed for high-touch targets.
