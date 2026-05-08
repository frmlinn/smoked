import { gl, ext, blit } from '../core/gl.js';
import { Program } from '../core/Program.js';
import { FBO } from '../core/FBO.js';
import { shaders } from '../shaders/index.js';
import { state } from '../conf.js';

export class PostProcessor {
    constructor() {
        this.colorProgram          = new Program(shaders.baseVert, shaders.colorFrag);
        this.blurProgram           = new Program(shaders.blurVert, shaders.blurFrag);
        
        this.bloomPrefilterProgram = new Program(shaders.baseVert, shaders.bloomPrefilterFrag);
        this.bloomBlurProgram      = new Program(shaders.baseVert, shaders.bloomBlurFrag);
        this.bloomFinalProgram     = new Program(shaders.baseVert, shaders.bloomFinalFrag);
        
        this.sunraysMaskProgram    = new Program(shaders.baseVert, shaders.sunraysMaskFrag);
        this.sunraysProgram        = new Program(shaders.baseVert, shaders.sunraysFrag);

        this.bloomFramebuffers = [];
        this.bloom = null;
        this.sunrays = null;
        this.sunraysTemp = null;
        
        this.displayProgram = null;
        this.activeKeywords = '';

        this.initFramebuffers();
        this.updateDisplayMaterial();
    }

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

    initFramebuffers() {
        const texType = ext.halfFloatTexType;
        const rgba = ext.formatRGBA;
        const r = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

        const bloomRes = this._getResolution(state.BLOOM_RESOLUTION);
        this.bloom = new FBO(bloomRes.width, bloomRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        this.bloomFramebuffers = [];
        
        for (let i = 0; i < state.BLOOM_ITERATIONS; i++) {
            let width = bloomRes.width >> (i + 1);
            let height = bloomRes.height >> (i + 1);
            if (width < 2 || height < 2) break;
            this.bloomFramebuffers.push(new FBO(width, height, rgba.internalFormat, rgba.format, texType, filtering));
        }

        const sunraysRes = this._getResolution(state.SUNRAYS_RESOLUTION);
        this.sunrays = new FBO(sunraysRes.width, sunraysRes.height, r.internalFormat, r.format, texType, filtering);
        this.sunraysTemp = new FBO(sunraysRes.width, sunraysRes.height, r.internalFormat, r.format, texType, filtering);
    }

    updateDisplayMaterial() {
        let keywords = [];
        if (state.SHADING) keywords.push('SHADING');
        if (state.BLOOM) keywords.push('BLOOM');
        if (state.SUNRAYS) keywords.push('SUNRAYS');
        
        const keywordString = keywords.join(',');
        if (this.activeKeywords === keywordString && this.displayProgram !== null) return;
        
        this.activeKeywords = keywordString;
        
        // Inyectamos los #define justo debajo del #version 300 es
        let fragSource = shaders.displayFrag;
        let defines = '';
        keywords.forEach(kw => defines += `#define ${kw}\n`);
        fragSource = fragSource.replace('#version 300 es', `#version 300 es\n${defines}`);

        this.displayProgram = new Program(shaders.baseVert, fragSource);
    }

    render(solver) {
        this.updateDisplayMaterial();

        if (state.BLOOM) this.applyBloom(solver.dye.read, this.bloom);
        
        if (state.SUNRAYS) {
            this.applySunrays(solver.dye.read, solver.dye.write, this.sunrays);
            this.blur(this.sunrays, this.sunraysTemp, 1);
        }

        // 1. Pintar el fondo TOTALMENTE OPACO (sin blending)
        gl.disable(gl.BLEND);
        this.drawColor(null, this.normalizeColor(state.BACK_COLOR));

        // 2. Activar el blending solo para pintar el fluido encima
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        
        this.drawDisplay(solver, null);
    }

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

        // Downsample
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

        // Upsample
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

    drawColor(target, color) {
        this.colorProgram.bind();
        gl.uniform4f(this.colorProgram.uniforms.color, color.r, color.g, color.b, 1);
        blit(target);
    }

    drawDisplay(solver, target) {
        let width = target == null ? gl.drawingBufferWidth : target.width;
        let height = target == null ? gl.drawingBufferHeight : target.height;

        this.displayProgram.bind();
        if (state.SHADING) {
            gl.uniform2f(this.displayProgram.uniforms.texelSize, 1.0 / width, 1.0 / height);
        }
        
        gl.uniform1i(this.displayProgram.uniforms.uTexture, solver.dye.read.attach(0));
        
        if (state.BLOOM) {
            gl.uniform1i(this.displayProgram.uniforms.uBloom, this.bloom.attach(1));
        }
        if (state.SUNRAYS) {
            gl.uniform1i(this.displayProgram.uniforms.uSunrays, this.sunrays.attach(2)); // Era 3, pero al quitar dithering, baja a 2
        }
        blit(target);
    }

    normalizeColor(input) {
        return {
            r: input.r / 255,
            g: input.g / 255,
            b: input.b / 255
        };
    }
}