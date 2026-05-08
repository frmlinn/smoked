import { Pane } from 'tweakpane';

export const state = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 1.0,
    VELOCITY_DISSIPATION: 0.2,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 10,
    SPLAT_RADIUS: 0.25,
    SPLAT_FORCE: 6000,
    SHADING: true,
    RAINBOW: true,
    COLOR_UPDATE_SPEED: 10,
    PAUSE: false,
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
};
export const pane = new Pane({ title: 'Smoked Config' });

const simFolder = pane.addFolder({ title: 'Simulation' });
//simFolder.addBinding(state, 'SIM_RESOLUTION', { options: { '32': 32, '64': 64, '128': 128, '256': 256 }});
//simFolder.addBinding(state, 'DYE_RESOLUTION', { options: { '128': 128, '256': 256, '512': 512, '1024': 1024 }});
simFolder.addBinding(state, 'DENSITY_DISSIPATION', { min: 0, max: 4.0 });
simFolder.addBinding(state, 'VELOCITY_DISSIPATION', { min: 0, max: 4.0 });
simFolder.addBinding(state, 'PRESSURE', { min: 0, max: 1.0 });
simFolder.addBinding(state, 'CURL', { min: 0, max: 50, step: 1 });
simFolder.addBinding(state, 'SPLAT_RADIUS', { min: 0.01, max: 1.0 });
simFolder.addBinding(state, 'PAUSE');

// --- VISUALS FOLDER ---
const visualsFolder = pane.addFolder({ title: 'Visuals' });
visualsFolder.addBinding(state, 'SHADING');
visualsFolder.addBinding(state, 'RAINBOW');
visualsFolder.addBinding(state, 'BACK_COLOR');

// --- BLOOM FOLDER ---
const bloomFolder = pane.addFolder({ title: 'Bloom', expanded: false });
bloomFolder.addBinding(state, 'BLOOM');
bloomFolder.addBinding(state, 'BLOOM_INTENSITY', { min: 0.1, max: 2.0 });
bloomFolder.addBinding(state, 'BLOOM_THRESHOLD', { min: 0.0, max: 1.0 });

// --- SUNRAYS FOLDER ---
const sunraysFolder = pane.addFolder({ title: 'Sunrays', expanded: false });
sunraysFolder.addBinding(state, 'SUNRAYS');
sunraysFolder.addBinding(state, 'SUNRAYS_WEIGHT', { min: 0.3, max: 1.0 });

pane.addButton({ title: 'SPLAT!' });