import { gl, ext, blit } from '../core/gl.js';
import { Program } from '../core/Program.js';
import { FBO } from '../core/FBO.js';
import { shaders } from '../shaders/index.js';
import { state } from '../conf.js';

/**
 * Handles all post-processing and final rendering pipelines.
 * Dynamically switches programs based on the active view profile to save GPU cycles,
 * preventing redundant frame buffer operations.
 */
export class PostProcessor {
    /**
     * Initializes the PostProcessor, compiling all required shaders and allocating memory
     * for framebuffers and vector geometry.
     */
    constructor() {
        // --- Core Effect Programs ---
        this.colorProgram          = new Program(shaders.baseVert, shaders.colorFrag);
        this.blurProgram           = new Program(shaders.blurVert, shaders.blurFrag);
        this.bloomPrefilterProgram = new Program(shaders.baseVert, shaders.bloomPrefilterFrag);
        this.bloomBlurProgram      = new Program(shaders.baseVert, shaders.bloomBlurFrag);
        this.bloomFinalProgram     = new Program(shaders.baseVert, shaders.bloomFinalFrag);
        this.sunraysMaskProgram    = new Program(shaders.baseVert, shaders.sunraysMaskFrag);
        this.sunraysProgram        = new Program(shaders.baseVert, shaders.sunraysFrag);
        
        // --- View Profile Programs ---
        this.displayColorProgram    = new Program(shaders.baseVert, shaders.displayColorFrag);
        this.displayPressureProgram = new Program(shaders.baseVert, shaders.displayPressureFrag);
        this.displayTempProgram     = new Program(shaders.baseVert, shaders.displayTemperatureFrag);
        this.vectorProgram          = new Program(shaders.vectorVert, shaders.vectorFrag); 

        // --- Framebuffer Objects (FBOs) ---
        /** @type {FBO[]} Array of framebuffers used for bloom downsampling */
        this.bloomFramebuffers = [];
        this.bloom = null;
        this.sunrays = null;
        this.sunraysTemp = null;
        
        // --- Geometry Data ---
        /** @type {WebGLVertexArrayObject | null} VAO holding the vector grid lines */
        this.vectorVao = null;
        /** @type {number} Total number of vertices in the vector grid */
        this.vectorCount = 0;

        this.initFramebuffers();
        this.initVectors();
    }

    /**
     * Calculates the correct resolution respecting the canvas aspect ratio.
     * @private
     * @param {number} resolution - The base scalar resolution constraint.
     * @returns {{width: number, height: number}} The adjusted resolution object.
     */
    _getResolution(resolution) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio < 1.0) aspectRatio = 1.0 / aspectRatio;

        let min = Math.round(resolution);
        let max = Math.round(resolution * aspectRatio);

        return (gl.drawingBufferWidth > gl.drawingBufferHeight) 
            ? { width: max, height: min } 
            : { width: min, height: max };
    }

    /**
     * Allocates or resizes the framebuffers required for post-processing effects (Bloom, Sunrays).
     * Builds a mip-chain for the bloom blur passes.
     */
    initFramebuffers() {
        const texType = ext.halfFloatTexType;
        const rgba = ext.formatRGBA;
        const r = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

        const bloomRes = this._getResolution(state.BLOOM_RESOLUTION);
        
        if (!this.bloom) {
            this.bloom = new FBO(bloomRes.width, bloomRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        } else {
            this.bloom.resize(bloomRes.width, bloomRes.height);
        }
        
        // Clean up previous mip-chain if resizing
        if (this.bloomFramebuffers.length > 0) {
            this.bloomFramebuffers.forEach(fbo => fbo.release());
        }
        this.bloomFramebuffers = [];
        
        // Construct the downsampled FBO chain for Bloom
        for (let i = 0; i < state.BLOOM_ITERATIONS; i++) {
            let width = bloomRes.width >> (i + 1);
            let height = bloomRes.height >> (i + 1);
            if (width < 2 || height < 2) break;
            this.bloomFramebuffers.push(new FBO(width, height, rgba.internalFormat, rgba.format, texType, filtering));
        }

        const sunraysRes = this._getResolution(state.SUNRAYS_RESOLUTION);
        if (!this.sunrays) {
            this.sunrays = new FBO(sunraysRes.width, sunraysRes.height, r.internalFormat, r.format, texType, filtering);
            this.sunraysTemp = new FBO(sunraysRes.width, sunraysRes.height, r.internalFormat, r.format, texType, filtering);
        } else {
            this.sunrays.resize(sunraysRes.width, sunraysRes.height);
            this.sunraysTemp.resize(sunraysRes.width, sunraysRes.height);
        }
    }

    /**
     * Initializes the static grid geometry used for visualizing velocity vectors.
     * Maps [-1, 1] clip-space coordinates to a grid of lines.
     */
    initVectors() {
        const gridResolution = 60; 
        const positions = [];
        const dirs = []; // 0.0 for line origin, 1.0 for line tip
        
        for (let y = 0; y < gridResolution; y++) {
            for (let x = 0; x < gridResolution; x++) {
                let px = (x / (gridResolution - 1)) * 2.0 - 1.0;
                let py = (y / (gridResolution - 1)) * 2.0 - 1.0;
                
                // Line base vertex
                positions.push(px, py); 
                dirs.push(0.0); 

                // Line tip vertex
                positions.push(px, py); 
                dirs.push(1.0);
            }
        }
        
        this.vectorCount = gridResolution * gridResolution * 2;
        
        if (this.vectorVao) gl.deleteVertexArray(this.vectorVao);
        this.vectorVao = gl.createVertexArray();
        gl.bindVertexArray(this.vectorVao);

        // Position Buffer (Location 0)
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); 
        gl.enableVertexAttribArray(0);

        // Direction Flag Buffer (Location 1)
        const dirBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, dirBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dirs), gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); 
        gl.enableVertexAttribArray(1);

        gl.bindVertexArray(null);
    }

    /**
     * Master rendering pipeline.
     * Conditionally executes specific GPU paths based on the active UI view profile.
     * @param {Object} solver - The FluidSolver instance containing data textures.
     */
    render(solver) {
        // 1. Process costly aesthetics ONLY in Artist Mode (0)
        if (state.VIEW_MODE === 0) {
            if (state.BLOOM) this.applyBloom(solver.dye.read, this.bloom);
            if (state.SUNRAYS) {
                this.applySunrays(solver.dye.read, solver.dye.write, this.sunrays);
                this.blur(this.sunrays, this.sunraysTemp, 1);
            }
        }

        // 2. Prepare base canvas state
        gl.disable(gl.BLEND);
        this.drawColor(null, this.normalizeColor(state.BACK_COLOR));

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        
        // 3. Dispatch to the corresponding specialized display shader
        switch (state.VIEW_MODE) {
            case 0: // Artist Profile
                this.drawDisplayColor(solver, null);
                break;
            case 1: // Scientific Profile (Pressure & Vectors)
                this.drawDisplayPressure(solver, null);
                if (state.SHOW_VECTORS) {
                    this.drawVectors(solver, null);
                }
                break;
            case 2: // Thermal Profile
                this.drawDisplayTemperature(solver, null);
                break;
        }
    }

    // =========================================================================
    // SPECIFIC DISPLAY DRAW CALLS
    // =========================================================================

    /**
     * Renders the fluid dye with applied lighting, bloom, and sunrays.
     * @param {Object} solver - The FluidSolver instance.
     * @param {FBO | null} target - Target FBO, or null for default canvas.
     */
    drawDisplayColor(solver, target) {
        let width = target ? target.width : gl.drawingBufferWidth;
        let height = target ? target.height : gl.drawingBufferHeight;

        this.displayColorProgram.bind();
        gl.uniform2f(this.displayColorProgram.uniforms.texelSize, 1.0 / width, 1.0 / height);
        
        gl.uniform1i(this.displayColorProgram.uniforms.uEnableShading, state.SHADING ? 1 : 0);
        gl.uniform1i(this.displayColorProgram.uniforms.uEnableBloom, state.BLOOM ? 1 : 0);
        gl.uniform1i(this.displayColorProgram.uniforms.uEnableSunrays, state.SUNRAYS ? 1 : 0);

        gl.uniform1i(this.displayColorProgram.uniforms.uTexture, solver.dye.read.attach(0));
        
        if (this.bloom) gl.uniform1i(this.displayColorProgram.uniforms.uBloom, this.bloom.attach(1));
        if (this.sunrays) gl.uniform1i(this.displayColorProgram.uniforms.uSunrays, this.sunrays.attach(2));

        blit(target);
    }

    /**
     * Renders the scalar pressure field mapping (Red/Blue gradient).
     * @param {Object} solver - The FluidSolver instance.
     * @param {FBO | null} target - Target FBO, or null for default canvas.
     */
    drawDisplayPressure(solver, target) {
        this.displayPressureProgram.bind();
        gl.uniform1i(this.displayPressureProgram.uniforms.uPressure, solver.pressure.read.attach(0));
        gl.uniform1f(this.displayPressureProgram.uniforms.uContrast, state.PRESSURE_CONTRAST);
        blit(target);
    }

    /**
     * Renders the thermal vision mode reading the temperature (alpha channel).
     * @param {Object} solver - The FluidSolver instance.
     * @param {FBO | null} target - Target FBO, or null for default canvas.
     */
    drawDisplayTemperature(solver, target) {
        this.displayTempProgram.bind();
        gl.uniform1i(this.displayTempProgram.uniforms.uTexture, solver.dye.read.attach(0));
        gl.uniform1f(this.displayTempProgram.uniforms.uAmbientTemperature, state.AMBIENT_TEMPERATURE);
        blit(target);
    }

    /**
     * Overlays a static grid of vector lines, displacing their tips based on fluid velocity.
     * Does not use the 'blit' quad approach; manually dispatches gl.drawArrays.
     * @param {Object} solver - The FluidSolver instance.
     * @param {FBO | null} target - Target FBO, or null for default canvas.
     */
    drawVectors(solver, target) {
        let width = target ? target.width : gl.drawingBufferWidth;
        let height = target ? target.height : gl.drawingBufferHeight;

        // Manual viewport mapping for raw geometry dispatch
        gl.viewport(0, 0, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);

        this.vectorProgram.bind();
        gl.uniform1i(this.vectorProgram.uniforms.uVelocity, solver.velocity.read.attach(0));
        gl.uniform1f(this.vectorProgram.uniforms.uAspectRatio, width / height);

        gl.bindVertexArray(this.vectorVao);
        gl.drawArrays(gl.LINES, 0, this.vectorCount);
        gl.bindVertexArray(null);
    }

    // =========================================================================
    // POST-PROCESSING EFFECT CALLS
    // =========================================================================

    /**
     * Generates a multi-pass bloom effect via downsampling and upsampling.
     * @param {FBO} source - The texture to extract bright areas from.
     * @param {FBO} destination - The target framebuffer holding the final blurred bloom.
     */
    applyBloom(source, destination) {
        if (this.bloomFramebuffers.length < 2) return;
        let last = destination;

        gl.disable(gl.BLEND);
        this.bloomPrefilterProgram.bind();
        let knee = state.BLOOM_THRESHOLD * state.BLOOM_SOFT_KNEE + 0.0001;
        let curve0 = state.BLOOM_THRESHOLD - knee;
        let curve1 = knee * 2.0;
        let curve2 = 0.25 / knee;
        gl.uniform3f(this.bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
        gl.uniform1f(this.bloomPrefilterProgram.uniforms.threshold, state.BLOOM_THRESHOLD);
        gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
        blit(last);

        // Downsample phase
        this.bloomBlurProgram.bind();
        for (let i = 0; i < this.bloomFramebuffers.length; i++) {
            let dest = this.bloomFramebuffers[i];
            gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
            gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
            blit(dest);
            last = dest;
        }

        gl.blendFunc(gl.ONE, gl.ONE);
        gl.enable(gl.BLEND);

        // Upsample phase
        for (let i = this.bloomFramebuffers.length - 2; i >= 0; i--) {
            let baseTex = this.bloomFramebuffers[i];
            gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
            gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
            gl.viewport(0, 0, baseTex.width, baseTex.height);
            blit(baseTex);
            last = baseTex;
        }

        gl.disable(gl.BLEND);
        this.bloomFinalProgram.bind();
        gl.uniform2f(this.bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(this.bloomFinalProgram.uniforms.uTexture, last.attach(0));
        gl.uniform1f(this.bloomFinalProgram.uniforms.intensity, state.BLOOM_INTENSITY);
        blit(destination);
    }

    /**
     * Generates volumetric light scattering (Sunrays) based on dye density.
     * @param {FBO} source - Raw dye data.
     * @param {FBO} mask - Intermediate FBO to store the masked light emitter.
     * @param {FBO} destination - Output FBO containing the sunrays.
     */
    applySunrays(source, mask, destination) {
        gl.disable(gl.BLEND);
        this.sunraysMaskProgram.bind();
        gl.uniform1i(this.sunraysMaskProgram.uniforms.uTexture, source.attach(0));
        blit(mask);

        this.sunraysProgram.bind();
        gl.uniform1f(this.sunraysProgram.uniforms.weight, state.SUNRAYS_WEIGHT);
        gl.uniform1i(this.sunraysProgram.uniforms.uTexture, mask.attach(0));
        blit(destination);
    }

    /**
     * Utility method to run a separable blur ping-pong.
     * @param {FBO} target - FBO containing the data to blur.
     * @param {FBO} temp - Intermediate scratch FBO.
     * @param {number} iterations - Number of blur passes.
     */
    blur(target, temp, iterations) {
        this.blurProgram.bind();
        for (let i = 0; i < iterations; i++) {
            // Horizontal Pass
            gl.uniform2f(this.blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
            gl.uniform1i(this.blurProgram.uniforms.uTexture, target.attach(0));
            blit(temp);

            // Vertical Pass
            gl.uniform2f(this.blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
            gl.uniform1i(this.blurProgram.uniforms.uTexture, temp.attach(0));
            blit(target);
        }
    }

    /**
     * Clears the current buffer with a solid flat color.
     * @param {FBO | null} target - Target FBO, or null for default canvas.
     * @param {{r: number, g: number, b: number}} color - Normalized RGB color.
     */
    drawColor(target, color) {
        this.colorProgram.bind();
        gl.uniform4f(this.colorProgram.uniforms.color, color.r, color.g, color.b, 1.0);
        blit(target);
    }

    /**
     * Converts an 8-bit [0-255] RGB color object to normalized [0-1] coordinates.
     * @param {{r: number, g: number, b: number}} input - Raw RGB color object.
     * @returns {{r: number, g: number, b: number}} Normalized RGB color.
     */
    normalizeColor(input) {
        return { r: input.r / 255.0, g: input.g / 255.0, b: input.b / 255.0 };
    }
}