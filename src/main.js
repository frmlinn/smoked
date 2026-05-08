import { state, pane } from './conf.js';
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

pane.on('change', (ev) => {
    if (ev.presetKey === 'SIM_RESOLUTION' || ev.presetKey === 'DYE_RESOLUTION') {
        solver.initFramebuffers();
    }
    if (ev.presetKey === 'BLOOM_RESOLUTION') {
        post.initFramebuffers();
    }
});

// Botón de Random Splats
const btnRef = pane.children.find(c => c.title === 'Random Splats');
if (btnRef) {
    btnRef.on('click', () => {
        pointerManager.splatStack.push(parseInt(Math.random() * 20) + 5);
    });
}
function resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.floor(canvas.clientWidth * pixelRatio);
    const height = Math.floor(canvas.clientHeight * pixelRatio);

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        solver.initFramebuffers();
        post.initFramebuffers();
        return true;
    }
    return false;
}

function updateColors(dt) {
    if (!state.COLORFUL) return;

    colorUpdateTimer += dt * state.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer %= 1;
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
        const dx = 1000 * (Math.random() - 0.5);
        const dy = 1000 * (Math.random() - 0.5);
        solver.splat(x, y, dx, dy, color);
    }
}

function applyInputs() {
    if (pointerManager.splatStack.length > 0) {
        multipleSplats(pointerManager.splatStack.pop());
    }

    pointerManager.pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            let dx = p.deltaX * state.SPLAT_FORCE;
            let dy = p.deltaY * state.SPLAT_FORCE;
            solver.splat(p.texcoordX, p.texcoordY, dx, dy, p.color);
        }
    });
}

function update(time) {
    if (lastTime === 0) lastTime = time; 

    let dt = (time - lastTime) / 1000; 
    dt = Math.min(dt, 0.016666); 
    lastTime = time;

    resizeCanvas();
    updateColors(dt);
    applyInputs();

    if (!state.PAUSE) {
        solver.step(dt);
    }

    post.render(solver);

    requestAnimationFrame(update);
}

pointerManager.splatStack.push(parseInt(Math.random() * 20) + 5);

resizeCanvas();
requestAnimationFrame(update);