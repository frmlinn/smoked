import { gl, ext, blit } from '../core/gl.js';
import { Program } from '../core/Program.js';
import { FBO } from '../core/FBO.js';
import { shaders } from '../shaders/index.js';
import { state } from '../conf.js';

/**
 * Handles all post-processing effects such as Bloom, Sunrays, and final shading.
 */
export class PostProcessor {
    /**
     * Initializes shader programs and framebuffers for post-processing.
     */
    constructor() {
        this.colorProgram          = new Program(shaders.baseVert, shaders.colorFrag);
        this.blurProgram           = new Program(shaders.blurVert, shaders.blurFrag);
        this.bloomPrefilterProgram = new Program(shaders.baseVert, shaders.bloomPrefilterFrag);
        this.bloomBlurProgram      = new Program(shaders.baseVert, shaders.bloomBlurFrag);
        this.bloomFinalProgram     = new Program(shaders.baseVert, shaders.bloomFinalFrag);
        this.sunraysMaskProgram    = new Program(shaders.baseVert, shaders.sunraysMaskFrag);
        this.sunraysProgram        = new Program(shaders.baseVert, shaders.sunraysFrag);
        this.displayProgram        = new Program(shaders.baseVert, shaders.displayFrag);

        this.bloomFramebuffers = [];
        this.bloom = null;
        this.sunrays = null;
        this.sunraysTemp = null;

        this.initFramebuffers();
    }

    /**
     * Calculates resolution scaled by aspect ratio.
     * @private
     * @param {number} resolution - Target base resolution.
     * @returns {{width: number, height: number}} Scaled dimensions.
     */
    _getResolution(resolution) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

        let min = Math.round(resolution);
        let max = Math.round(resolution * aspectRatio);

        if (gl.drawingBufferWidth > gl.drawingBufferHeight)
            return { width: max, height: min };
        else
            return { width: min, height: max };
    }

    /**
     * Initializes or resizes post-processing framebuffers based on current configuration.
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
        
        if (this.bloomFramebuffers && this.bloomFramebuffers.length > 0) {
            this.bloomFramebuffers.forEach(fbo => fbo.release());
        }
        this.bloomFramebuffers = [];
        
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
     * Executes the post-processing pipeline.
     * @param {import('../simulation/FluidSolver.js').FluidSolver} solver - The fluid simulation solver.
     */
    render(solver) {
        if (state.BLOOM) this.applyBloom(solver.dye.read, this.bloom);
        
        if (state.SUNRAYS) {
            this.applySunrays(solver.dye.read, solver.dye.write, this.sunrays);
            this.blur(this.sunrays, this.sunraysTemp, 1);
        }

        gl.disable(gl.BLEND);
        this.drawColor(null, this.normalizeColor(state.BACK_COLOR));

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        
        this.drawDisplay(solver, null);
    }

    /**
     * Applies bloom effect via prefiltering, downsampling, and upsampling.
     * @param {FBO} source - The source framebuffer.
     * @param {FBO} destination - The target framebuffer.
     */
    applyBloom(source, destination) {
        if (this.bloomFramebuffers.length < 2) return;

        let last = destination;

        gl.disable(gl.BLEND);
        this.bloomPrefilterProgram.bind();
        let knee = state.BLOOM_THRESHOLD * state.BLOOM_SOFT_KNEE + 0.0001;
        let curve0 = state.BLOOM_THRESHOLD - knee;
        let curve1 = knee * 2;
        let curve2 = 0.25 / knee;
        gl.uniform3f(this.bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
        gl.uniform1f(this.bloomPrefilterProgram.uniforms.threshold, state.BLOOM_THRESHOLD);
        gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
        blit(last);

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
     * Applies volumetric light rays effect.
     * @param {FBO} source - Base image texture.
     * @param {FBO} mask - Temporary mask FBO.
     * @param {FBO} destination - Target FBO for sunrays.
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
     * Applies a dual-pass Gaussian blur.
     * @param {FBO} target - The framebuffer to blur.
     * @param {FBO} temp - Temporary ping-pong framebuffer.
     * @param {number} iterations - Number of blur passes.
     */
    blur(target, temp, iterations) {
        this.blurProgram.bind();
        for (let i = 0; i < iterations; i++) {
            gl.uniform2f(this.blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
            gl.uniform1i(this.blurProgram.uniforms.uTexture, target.attach(0));
            blit(temp);

            gl.uniform2f(this.blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
            gl.uniform1i(this.blurProgram.uniforms.uTexture, temp.attach(0));
            blit(target);
        }
    }

    /**
     * Fills the target with a solid color.
     * @param {FBO|null} target - Destination FBO, or null for screen.
     * @param {{r: number, g: number, b: number}} color - Normalized RGB color.
     */
    drawColor(target, color) {
        this.colorProgram.bind();
        gl.uniform4f(this.colorProgram.uniforms.color, color.r, color.g, color.b, 1);
        blit(target);
    }

    /**
     * Renders the final composed image to the screen or target.
     * @param {import('../simulation/FluidSolver.js').FluidSolver} solver - The fluid simulation solver.
     * @param {FBO|null} target - Target FBO, or null for default framebuffer.
     */
    drawDisplay(solver, target) {
        let width = target == null ? gl.drawingBufferWidth : target.width;
        let height = target == null ? gl.drawingBufferHeight : target.height;

        this.displayProgram.bind();
        
        gl.uniform2f(this.displayProgram.uniforms.texelSize, 1.0 / width, 1.0 / height);
        
        gl.uniform1i(this.displayProgram.uniforms.uEnableShading, state.SHADING ? 1 : 0);
        gl.uniform1i(this.displayProgram.uniforms.uEnableBloom, state.BLOOM ? 1 : 0);
        gl.uniform1i(this.displayProgram.uniforms.uEnableSunrays, state.SUNRAYS ? 1 : 0);

        gl.uniform1i(this.displayProgram.uniforms.uTexture, solver.dye.read.attach(0));
        
        if (this.bloom) {
            gl.uniform1i(this.displayProgram.uniforms.uBloom, this.bloom.attach(1));
        }
        if (this.sunrays) {
            gl.uniform1i(this.displayProgram.uniforms.uSunrays, this.sunrays.attach(2));
        }

        blit(target);
    }

    /**
     * Normalizes an 8-bit color object to [0, 1] range.
     * @param {{r: number, g: number, b: number}} input - Base color.
     * @returns {{r: number, g: number, b: number}} Normalized color.
     */
    normalizeColor(input) {
        return {
            r: input.r / 255,
            g: input.g / 255,
            b: input.b / 255
        };
    }
}