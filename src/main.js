import { state, fpsGraph, onRandomSplat, onClearObstacles } from './conf.js';
import { initWebGL } from './core/gl.js';
import { FluidSolver } from './simulation/FluidSolver.js';
import { PostProcessor } from './postprocess/PostProcessor.js';
import { PointerManager } from './inputs/PointerManager.js';

const canvas = document.getElementById('glcanvas');
initWebGL(canvas);

const solver = new FluidSolver();
const post = new PostProcessor();
const pointerManager = new PointerManager(canvas);

let lastTime = 0;
let colorUpdateTimer = 0.0;
let canvasWidth = canvas.clientWidth;
let canvasHeight = canvas.clientHeight;
let resizeTimeout;

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

onClearObstacles(() => {
    // Si la función existe (se creará en la Fase 2), la llamamos.
    if (solver.clearObstacles) solver.clearObstacles();
});

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

function multipleSplats(amount) {
    for (let i = 0; i < amount; i++) {
        const color = pointerManager.generateColor();
        color.r *= 10.0; color.g *= 10.0; color.b *= 10.0;
        const x = Math.random();
        const y = Math.random();
        const dx = 1000.0 * (Math.random() - 0.5);
        const dy = 1000.0 * (Math.random() - 0.5);
        solver.splat(x, y, dx, dy, color);
    }
}

/**
 * Resolves cached pointer changes and processes the automated splat queue.
 * Incluye lógica Lerp para el trazado continuo de obstáculos.
 */
function applyInputs() {
    if (pointerManager.splatStack.length > 0) {
        multipleSplats(pointerManager.splatStack.pop());
    }

    pointerManager.pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            
            if (state.TOOL_MODE === 0) {
                // Herramienta Fluido
                const dx = p.deltaX * state.SPLAT_FORCE;
                const dy = p.deltaY * state.SPLAT_FORCE;
                solver.splat(p.texcoordX, p.texcoordY, dx, dy, p.color);
            } else {
                // Herramienta Obstáculo (Pintar o Borrar)
                if (!solver.splatObstacle) return; 
                
                const isEraser = state.TOOL_MODE === 2;
                
                // ¡Adiós al bucle for (lerp)! Pasamos ambos puntos directamente y la GPU
                // dibuja la línea completa en 1 solo frame. 0% Lag.
                solver.splatObstacle(
                    p.texcoordX, p.texcoordY, 
                    p.prevTexcoordX, p.prevTexcoordY, 
                    state.OBSTACLE_RADIUS, 
                    isEraser
                );
            }
        }
    });
}

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