import { gl, ext, blit } from '../core/gl.js';
import { GLResource } from '../core/GLResource.js';
import { Program } from '../core/Program.js';
import { FBO } from '../core/FBO.js';
import { DoubleFBO } from '../core/DoubleFBO.js';
import { shaders } from '../shaders/index.js';
import { state } from '../conf.js';

/**
 * Stable Eulerian Navier-Stokes fluid simulation solver using WebGL2 GPGPU passes.
 */
export class FluidSolver {
    /**
     * Compiles GPGPU shader programs and prepares simulation properties.
     */
    constructor() {
        /** @type {Program} Clears texture data or initializes fields */
        this.clearProgram           = new Program(shaders.baseVert, shaders.clearFrag);
        /** @type {Program} Semi-Lagrangian advection program */
        this.advectionProgram       = new Program(shaders.baseVert, shaders.advectionFrag);
        /** @type {Program} Computes velocity divergence field */
        this.divergenceProgram      = new Program(shaders.baseVert, shaders.divergenceFrag);
        /** @type {Program} Jacobi relaxation solver for scalar pressure field */
        this.pressureProgram        = new Program(shaders.baseVert, shaders.pressureFrag);
        /** @type {Program} Subtracts pressure gradient to enforce incompressibility */
        this.gradienSubtractProgram = new Program(shaders.baseVert, shaders.gradientSubtractFrag);
        /** @type {Program} Injects external forces/impulses into the simulation grid */
        this.splatProgram           = new Program(shaders.baseVert, shaders.splatFrag);
        /** @type {Program} Monolithic pass combining buoyancy, gravity, and vorticity forces */
        this.physicsForcesProgram   = new Program(shaders.baseVert, shaders.physicsForcesFrag);

        /** @type {DoubleFBO|null} Stores RGB dye density and Alpha temperature */
        this.dye = null;
        /** @type {DoubleFBO|null} Stores XY velocity vectors */
        this.velocity = null;
        /** @type {FBO|null} Stores scalar divergence data */
        this.divergence = null;
        /** @type {DoubleFBO|null} Stores scalar pressure field data */
        this.pressure = null;

        this.initFramebuffers();
    }

    /**
     * Calculates aspect ratio-corrected dimensions constraint by a base resolution scale.
     * @private
     * @param {number} resolution - Target scalar resolution scale.
     * @returns {{width: number, height: number}} Resolution dimensions.
     */
    _getResolution(resolution) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio < 1.0) aspectRatio = 1.0 / aspectRatio;

        const min = Math.round(resolution);
        const max = Math.round(resolution * aspectRatio);

        return (gl.drawingBufferWidth > gl.drawingBufferHeight) 
            ? { width: max, height: min } 
            : { width: min, height: max };
    }

    /**
     * Allocates or resizes simulation DoubleFBOs and FBO structures.
     */
    initFramebuffers() {
        const simRes = this._getResolution(state.SIM_RESOLUTION);
        const dyeRes = this._getResolution(state.DYE_RESOLUTION);
        const texType = ext.halfFloatTexType;
        const rgba    = ext.formatRGBA;
        const rg      = ext.formatRG;
        const r       = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

        gl.disable(gl.BLEND);

        this.dye        = GLResource.initOrResize(this.dye, DoubleFBO, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        this.velocity   = GLResource.initOrResize(this.velocity, DoubleFBO, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        this.divergence = GLResource.initOrResize(this.divergence, FBO, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.pressure   = GLResource.initOrResize(this.pressure, DoubleFBO, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    /**
     * Dispatches complete Navier-Stokes simulation pipeline step to the GPU.
     * @param {number} dt - Frame delta time in seconds.
     */
    step(dt) {
        gl.disable(gl.BLEND);

        // --- 1. External Acceleration Forces Pass (Hardware-Toggled) ---
        if (state.BUOYANCY_FORCE > 0.0 || state.SMOKE_WEIGHT > 0.0 || state.CURL > 0.0) {
            this.physicsForcesProgram.bind();
            gl.uniform2f(this.physicsForcesProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
            gl.uniform1i(this.physicsForcesProgram.uniforms.uVelocity, this.velocity.read.attach(0));
            gl.uniform1i(this.physicsForcesProgram.uniforms.uDye, this.dye.read.attach(1));
            gl.uniform1f(this.physicsForcesProgram.uniforms.dt, dt);
            gl.uniform1f(this.physicsForcesProgram.uniforms.curl, state.CURL);
            gl.uniform1f(this.physicsForcesProgram.uniforms.buoyancy, state.BUOYANCY_FORCE);
            gl.uniform1f(this.physicsForcesProgram.uniforms.weight, state.SMOKE_WEIGHT);
            gl.uniform1f(this.physicsForcesProgram.uniforms.ambientTemperature, state.AMBIENT_TEMPERATURE);

            blit(this.velocity.write);
            this.velocity.swap();
        }

        // --- 2. Divergence Field Evaluation ---
        this.divergenceProgram.bind();
        gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        blit(this.divergence);

        // --- 3. Initial Boundary/Pressure Clearing ---
        this.clearProgram.bind();
        gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
        gl.uniform1f(this.clearProgram.uniforms.value, state.PRESSURE);
        blit(this.pressure.write);
        this.pressure.swap();

        // --- 4. Poisson Equation Relaxation (Jacobi Iterations) ---
        this.pressureProgram.bind();
        gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
        for (let i = 0; i < state.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
            blit(this.pressure.write);
            this.pressure.swap();
        }

        // --- 5. Gradient Subtraction (Incompressible Projection) ---
        this.gradienSubtractProgram.bind();
        gl.uniform2f(this.gradienSubtractProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.gradienSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
        gl.uniform1i(this.gradienSubtractProgram.uniforms.uVelocity, this.velocity.read.attach(1));
        blit(this.velocity.write);
        this.velocity.swap();

        // --- 6. Velocity Field Semi-Lagrangian Advection ---
        this.advectionProgram.bind();
        gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        const velocityId = this.velocity.read.attach(0);
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
        gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
        gl.uniform1f(this.advectionProgram.uniforms.dissipation, state.VELOCITY_DISSIPATION);
        blit(this.velocity.write);
        this.velocity.swap();

        // --- 7. Dye Density & Thermal Advection Pass ---
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
        gl.uniform1f(this.advectionProgram.uniforms.dissipation, state.DENSITY_DISSIPATION);
        blit(this.dye.write);
        this.dye.swap();
    }

    /**
     * Injects localized velocity forces, color density, and temperature values.
     * @param {number} x - Normalized X interaction position [0.0, 1.0].
     * @param {number} y - Normalized Y interaction position [0.0, 1.0].
     * @param {number} dx - Instantaneous velocity vector X force components.
     * @param {number} dy - Instantaneous velocity vector Y force components.
     * @param {{r: number, g: number, b: number}} color - Normalized RGB dye colors.
     * @param {number} [temperature=5.0] - Injected localized thermal amplitude.
     */
    splat(x, y, dx, dy, color, temperature = 5.0) { 
        gl.disable(gl.BLEND);

        this.splatProgram.bind();
        gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
        gl.uniform1f(this.splatProgram.uniforms.aspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight);
        gl.uniform2f(this.splatProgram.uniforms.point, x, y);
        gl.uniform4f(this.splatProgram.uniforms.color, dx, dy, 0.0, 0.0);
        gl.uniform1f(this.splatProgram.uniforms.radius, this._correctRadius(state.SPLAT_RADIUS / 100.0));
        blit(this.velocity.write);
        this.velocity.swap();

        gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
        gl.uniform4f(this.splatProgram.uniforms.color, color.r, color.g, color.b, temperature); 
        blit(this.dye.write);
        this.dye.swap();
    }

    /**
     * Adjusts splat execution radius to guarantee uniform circular shapes across viewports.
     * @private
     * @param {number} radius - Base interactive input radius.
     * @returns {number} Aspect ratio corrected radius bounds.
     */
    _correctRadius(radius) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio > 1.0) radius *= aspectRatio;
        return radius;
    }
}