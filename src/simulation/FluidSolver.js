import { gl, ext, blit } from '../core/gl.js';
import { GLResource } from '../core/GLResource.js';
import { Program } from '../core/Program.js';
import { FBO } from '../core/FBO.js';
import { DoubleFBO } from '../core/DoubleFBO.js';
import { shaders } from '../shaders/index.js';
import { state } from '../conf.js';

/**
 * Core solver for the fluid simulation using WebGL2 GPGPU techniques.
 * Handles the Eulerian Navier-Stokes rendering pipeline with early-exit optimizations.
 */
export class FluidSolver {
    /**
     * Initializes shader programs and allocates simulation framebuffers.
     */
    constructor() {
        this.clearProgram           = new Program(shaders.baseVert, shaders.clearFrag);
        this.advectionProgram       = new Program(shaders.baseVert, shaders.advectionFrag);
        this.divergenceProgram      = new Program(shaders.baseVert, shaders.divergenceFrag);
        this.curlProgram            = new Program(shaders.baseVert, shaders.curlFrag);
        this.vorticityProgram       = new Program(shaders.baseVert, shaders.vorticityFrag);
        this.pressureProgram        = new Program(shaders.baseVert, shaders.pressureFrag);
        this.gradienSubtractProgram = new Program(shaders.baseVert, shaders.gradientSubtractFrag);
        this.buoyancyProgram        = new Program(shaders.baseVert, shaders.buoyancyFrag);
        this.splatProgram           = new Program(shaders.baseVert, shaders.splatFrag);

        /** @type {DoubleFBO|null} Stores RGB dye color and Alpha temperature */
        this.dye = null;
        /** @type {DoubleFBO|null} Stores XY velocity vectors */
        this.velocity = null;
        /** @type {FBO|null} Stores velocity divergence field */
        this.divergence = null;
        /** @type {FBO|null} Stores curl (vorticity) scalar field */
        this.curl = null;
        /** @type {DoubleFBO|null} Stores pressure scalar field */
        this.pressure = null;

        this.initFramebuffers();
    }

    /**
     * Calculates the internal buffer resolution based on aspect ratio.
     * @private
     * @param {number} resolution - Base resolution scale.
     * @returns {{width: number, height: number}} Adjusted dimensions.
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
     * Allocates or resizes the DoubleFBOs and FBOs required for the simulation grid.
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
        this.curl       = GLResource.initOrResize(this.curl, FBO, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.pressure   = GLResource.initOrResize(this.pressure, DoubleFBO, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    /**
     * Executes a single simulation step resolving Navier-Stokes equations.
     * @param {number} dt - Delta time for the current frame.
     */
    step(dt) {
        gl.disable(gl.BLEND);

        // 0. EARLY EXIT: Thermal Buoyancy
        // Execute only if thermal or gravity forces are active
        if (state.BUOYANCY_FORCE > 0.0 || state.SMOKE_WEIGHT > 0.0) {
            this.buoyancyProgram.bind();
            gl.uniform1i(this.buoyancyProgram.uniforms.uVelocity, this.velocity.read.attach(0));
            gl.uniform1i(this.buoyancyProgram.uniforms.uDye, this.dye.read.attach(1));
            gl.uniform1f(this.buoyancyProgram.uniforms.ambientTemperature, state.AMBIENT_TEMPERATURE);
            gl.uniform1f(this.buoyancyProgram.uniforms.dt, dt);
            gl.uniform1f(this.buoyancyProgram.uniforms.buoyancy, state.BUOYANCY_FORCE);
            gl.uniform1f(this.buoyancyProgram.uniforms.weight, state.SMOKE_WEIGHT);
            blit(this.velocity.write);
            this.velocity.swap();
        }

        // 1 & 2. EARLY EXIT: Vorticity Confinement
        // Skip GPU passes if curl is zero
        if (state.CURL > 0.0) {
            this.curlProgram.bind();
            gl.uniform2f(this.curlProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
            gl.uniform1i(this.curlProgram.uniforms.uVelocity, this.velocity.read.attach(0));
            blit(this.curl);

            this.vorticityProgram.bind();
            gl.uniform2f(this.vorticityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
            gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
            gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curl.attach(1));
            gl.uniform1f(this.vorticityProgram.uniforms.curl, state.CURL);
            gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
            blit(this.velocity.write);
            this.velocity.swap();
        }

        // 3. Divergence
        this.divergenceProgram.bind();
        gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        blit(this.divergence);

        // 4. Clear Pressure
        this.clearProgram.bind();
        gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
        gl.uniform1f(this.clearProgram.uniforms.value, state.PRESSURE);
        blit(this.pressure.write);
        this.pressure.swap();

        // 5. Jacobi Iteration for Pressure
        this.pressureProgram.bind();
        gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
        for (let i = 0; i < state.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
            blit(this.pressure.write);
            this.pressure.swap();
        }

        // 6. Gradient Subtraction (Incompressibility projection)
        this.gradienSubtractProgram.bind();
        gl.uniform2f(this.gradienSubtractProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.gradienSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
        gl.uniform1i(this.gradienSubtractProgram.uniforms.uVelocity, this.velocity.read.attach(1));
        blit(this.velocity.write);
        this.velocity.swap();

        // 7. Velocity Advection (Semi-Lagrangian)
        this.advectionProgram.bind();
        gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        const velocityId = this.velocity.read.attach(0);
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
        gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
        gl.uniform1f(this.advectionProgram.uniforms.dissipation, state.VELOCITY_DISSIPATION);
        blit(this.velocity.write);
        this.velocity.swap();

        // 8. Dye & Temperature Advection
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
        gl.uniform1f(this.advectionProgram.uniforms.dissipation, state.DENSITY_DISSIPATION);
        blit(this.dye.write);
        this.dye.swap();
    }

    /**
     * Injects velocity and dye (with temperature) into the simulation grid.
     * @param {number} x - Normalized X coordinate.
     * @param {number} y - Normalized Y coordinate.
     * @param {number} dx - Delta X velocity.
     * @param {number} dy - Delta Y velocity.
     * @param {{r: number, g: number, b: number}} color - RGB dye color.
     * @param {number} [temperature=5.0] - Injected thermal value (Alpha channel).
     */
    splat(x, y, dx, dy, color, temperature = 5.0) { 
        gl.disable(gl.BLEND); // Prevent WebGL state corruption

        // Inject velocity
        this.splatProgram.bind();
        gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
        gl.uniform1f(this.splatProgram.uniforms.aspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight);
        gl.uniform2f(this.splatProgram.uniforms.point, x, y);
        gl.uniform4f(this.splatProgram.uniforms.color, dx, dy, 0.0, 0.0);
        gl.uniform1f(this.splatProgram.uniforms.radius, this._correctRadius(state.SPLAT_RADIUS / 100.0));
        blit(this.velocity.write);
        this.velocity.swap();

        // Inject dye & temperature
        gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
        gl.uniform4f(this.splatProgram.uniforms.color, color.r, color.g, color.b, temperature); 
        blit(this.dye.write);
        this.dye.swap();
    }

    /**
     * Corrects the splat radius to maintain a circular shape across different screen ratios.
     * @private
     * @param {number} radius - Base radius.
     * @returns {number} Aspect-corrected radius.
     */
    _correctRadius(radius) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio > 1.0) radius *= aspectRatio;
        return radius;
    }
}