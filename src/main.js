import { state, fpsGraph, onRandomSplat } from './conf.js';
import { initWebGL } from './core/gl.js';
import { FluidSolver } from './simulation/FluidSolver.js';
import { PostProcessor } from './postprocess/PostProcessor.js';
import { PointerManager } from './inputs/PointerManager.js';

const canvas = document.getElementById('glcanvas');
initWebGL(canvas);

const solver = new FluidSolver();
const post = new PostProcessor();
const pointerManager = new PointerManager(canvas);

/** @type {number} Monotonically increasing time cache marker */
let lastTime = 0;
/** @type {number} Periodic timer monitoring automated custom color switches */
let colorUpdateTimer = 0.0;

/** @type {number} Debounced DOM layout bounding width storage */
let canvasWidth = canvas.clientWidth;
/** @type {number} Debounced DOM layout bounding height storage */
let canvasHeight = canvas.clientHeight;
/** @type {number|undefined} Timer reference handling window resizing debounces */
let resizeTimeout;

/**
 * Monitors DOM resize actions, deploying a macro-debounce callback to block loop thrashing.
 * @type {ResizeObserver}
 */
const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        canvasWidth = entry.contentRect.width;
        canvasHeight = entry.contentRect.height;
    }
    
    clearTimeout(resizeTimeout);
    
    resizeTimeout = setTimeout(() => {
        resizeCanvas();
    }, 200);
});
resizeObserver.observe(canvas);

onRandomSplat(() => {
    pointerManager.splatStack.push(parseInt(Math.random() * 20.0) + 5);
});

/**
 * Resizes physical canvas and triggers WebGL2 texture reallocations.
 */
function resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.floor(canvasWidth * pixelRatio);
    const height = Math.floor(canvasHeight * pixelRatio);

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        
        solver.initFramebuffers();
        post.initFramebuffers();
    }
}

/**
 * Cycle pointer input colors automatically when running in Rainbow Mode.
 * @param {number} dt - Frame delta time in fractional seconds.
 */
function updateColors(dt) {
    if (!state.RAINBOW) return;

    colorUpdateTimer += dt * state.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1.0) {
        colorUpdateTimer %= 1.0;
        pointerManager.pointers.forEach(p => {
            p.color = pointerManager.generateColor();
        });
    }
}

/**
 * Dispatches multiple randomized force and dye impulses into the core solver.
 * @param {number} amount - Total quantity of simultaneous splats to evaluate.
 */
function multipleSplats(amount) {
    for (let i = 0; i < amount; i++) {
        const color = pointerManager.generateColor();
        color.r *= 10.0; 
        color.g *= 10.0; 
        color.b *= 10.0;
        const x = Math.random();
        const y = Math.random();
        const dx = 1000.0 * (Math.random() - 0.5);
        const dy = 1000.0 * (Math.random() - 0.5);
        solver.splat(x, y, dx, dy, color);
    }
}

/**
 * Resolves cached pointer changes and processes the automated splat queue.
 */
function applyInputs() {
    if (pointerManager.splatStack.length > 0) {
        multipleSplats(pointerManager.splatStack.pop());
    }

    pointerManager.pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            const dx = p.deltaX * state.SPLAT_FORCE;
            const dy = p.deltaY * state.SPLAT_FORCE;
            solver.splat(p.texcoordX, p.texcoordY, dx, dy, p.color);
        }
    });
}

/**
 * Main application execution loop handling updates and render scheduling.
 * @param {number} time - Current hardware timestamp from high-res clock loops.
 */
function update(time) {
    fpsGraph.begin();

    if (lastTime === 0) lastTime = time; 
    let dt = (time - lastTime) / 1000.0; 
    dt = Math.min(dt, 0.016666); 
    lastTime = time;

    updateColors(dt);
    applyInputs();

    if (!state.PAUSE) {
        solver.step(dt);
    }

    post.render(solver);

    fpsGraph.end();
    requestAnimationFrame(update);
}

pointerManager.splatStack.push(parseInt(Math.random() * 20.0) + 5);
resizeCanvas(); 
requestAnimationFrame(update);