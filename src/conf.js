import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';

/**
 * Global configuration state for the fluid simulation and rendering pipeline.
 * Bound directly to the Tweakpane UI for real-time updates.
 * @type {Object}
 */
export const state = {
    // --- Grid Resolutions ---
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1024,
    
    // --- Core Fluid Dynamics ---
    DENSITY_DISSIPATION: 1.0,
    VELOCITY_DISSIPATION: 0.2,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 0,
    
    // --- Thermodynamics ---
    AMBIENT_TEMPERATURE: 0.0,
    BUOYANCY_FORCE: 0.5,
    SMOKE_WEIGHT: 0.05,
    
    // --- Interaction ---
    SPLAT_RADIUS: 0.25,
    SPLAT_FORCE: 6000,
    PAUSE: false,

    // --- View Profile ---
    // 0: Artist, 1: Pressure, 2: Temperature
    VIEW_MODE: 0, 

    // --- Artist Profile Settings ---
    SHADING: true,
    RAINBOW: true,
    COLOR_UPDATE_SPEED: 10,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    
    BLOOM: true,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    
    SUNRAYS: true,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 1.0,

    // --- Scientific Profile Settings ---
    SHOW_VECTORS: false,
    PRESSURE_CONTRAST: 1.0,
};

// ==========================================================
// GUI INITIALIZATION
// ==========================================================

/** * Main Tweakpane instance for the application GUI.
 * @type {Pane} 
 */
export const pane = new Pane({ title: 'Smoked Engine' });

pane.registerPlugin(EssentialsPlugin);

/** * Real-time FPS monitoring graph.
 * @type {import('@tweakpane/core').BladeApi} 
 */
export const fpsGraph = pane.addBlade({
    view: 'fpsgraph',
    label: 'fps',
    lineCount: 2,
});

// ==========================================================
// A. CORE SIMULATION FOLDERS
// ==========================================================

const simFolder = pane.addFolder({ title: 'Simulation' });
simFolder.addBinding(state, 'PRESSURE_ITERATIONS', { min: 1, max: 50, step: 1 });
simFolder.addBinding(state, 'VELOCITY_DISSIPATION', { min: 0.0, max: 4.0 });
simFolder.addBinding(state, 'DENSITY_DISSIPATION', { min: 0.0, max: 4.0 });
simFolder.addBinding(state, 'CURL', { min: 0.0, max: 50.0, label: 'VORTICITY' });
simFolder.addBinding(state, 'SPLAT_RADIUS', { min: 0.01, max: 1.0 });
simFolder.addBinding(state, 'PAUSE');

const thermoFolder = pane.addFolder({ title: 'Thermodynamics' });
thermoFolder.addBinding(state, 'AMBIENT_TEMPERATURE', { min: 0.0, max: 1.0 });
thermoFolder.addBinding(state, 'BUOYANCY_FORCE', { min: 0.0, max: 5.0 });
thermoFolder.addBinding(state, 'SMOKE_WEIGHT', { min: 0.0, max: 1.0 });

// ==========================================================
// B. VIEW PROFILE TABS
// ==========================================================

const tab = pane.addTab({
    pages: [
        { title: 'Artist' },
        { title: 'Pressure' },
        { title: 'Temperature' },
    ],
});

// Sync WebGL render pipeline with the active UI tab
tab.on('select', (ev) => {
    state.VIEW_MODE = ev.index;
});

// --- TAB 0: ARTIST ---
const pArtist = tab.pages[0];
pArtist.addBinding(state, 'SHADING');
pArtist.addBinding(state, 'RAINBOW');
pArtist.addBinding(state, 'BACK_COLOR');

const bloomFolder = pArtist.addFolder({ title: 'Bloom', expanded: false });
bloomFolder.addBinding(state, 'BLOOM');
bloomFolder.addBinding(state, 'BLOOM_INTENSITY', { min: 0.1, max: 2.0 });
bloomFolder.addBinding(state, 'BLOOM_THRESHOLD', { min: 0.0, max: 1.0 });

const sunraysFolder = pArtist.addFolder({ title: 'Sunrays', expanded: false });
sunraysFolder.addBinding(state, 'SUNRAYS');
sunraysFolder.addBinding(state, 'SUNRAYS_WEIGHT', { min: 0.3, max: 1.0 });

// --- TAB 1: PRESSURE ---
const pPressure = tab.pages[1];
pPressure.addBinding(state, 'PRESSURE_CONTRAST', { min: 0.1, max: 5.0 });
pPressure.addBinding(state, 'SHOW_VECTORS');

// --- TAB 2: TEMPERATURE ---
const pTemp = tab.pages[2];
// Kept intentionally empty for future thermal-specific visualization settings.

// ==========================================================
// C. GLOBAL ACTIONS
// ==========================================================

const splatBtn = pane.addButton({ title: 'Splat!' });

/**
 * Registers a callback function to be executed when the 'Splat!' button is clicked.
 * @param {Function} callback - The execution handler.
 */
export const onRandomSplat = (callback) => {
    splatBtn.on('click', callback);
};