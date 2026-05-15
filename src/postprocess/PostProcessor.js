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
        
        this.displayColorProgram    = new Program(shaders.baseVert, shaders.displayColorFrag);
        this.displayPressureProgram = new Program(shaders.baseVert, shaders.displayPressureFrag);
        this.displayTempProgram     = new Program(shaders.baseVert, shaders.displayTemperatureFrag);
        this.vectorProgram          = new Program(shaders.vectorVert, shaders.vectorFrag); 

        this.bloomFramebuffers = [];
        this.bloom = null;
        this.sunrays = null;
        this.sunraysTemp = null;
        this.vectorVao = null;
        this.vectorCount = 0;

        this.initFramebuffers();
        this.initVectors();
    }

    _getResolution(resolution) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio < 1.0) aspectRatio = 1.0 / aspectRatio;
        let min = Math.round(resolution);
        let max = Math.round(resolution * aspectRatio);
        return (gl.drawingBufferWidth > gl.drawingBufferHeight) ? { width: max, height: min } : { width: min, height: max };
    }

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
        
        if (this.bloomFramebuffers.length > 0) {
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

    initVectors() {
        const gridResolution = 60; 
        const positions = [];
        const dirs = []; 
        for (let y = 0; y < gridResolution; y++) {
            for (let x = 0; x < gridResolution; x++) {
                let px = (x / (gridResolution - 1)) * 2.0 - 1.0;
                let py = (y / (gridResolution - 1)) * 2.0 - 1.0;
                positions.push(px, py); dirs.push(0.0); 
                positions.push(px, py); dirs.push(1.0);
            }
        }
        this.vectorCount = gridResolution * gridResolution * 2;
        if (this.vectorVao) gl.deleteVertexArray(this.vectorVao);
        this.vectorVao = gl.createVertexArray();
        gl.bindVertexArray(this.vectorVao);
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
        const dirBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, dirBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dirs), gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(1);
        gl.bindVertexArray(null);
    }

    render(solver) {
        if (state.VIEW_MODE === 0) {
            if (state.BLOOM) this.applyBloom(solver.dye.read, this.bloom);
            if (state.SUNRAYS) {
                // REDIRECCIÓN: Pasamos la textura visual (High-Res) a los Sunrays para calcular sombras nítidas
                this.applySunrays(solver.dye.read, solver.dye.write, this.sunrays, solver.obstaclesDisplay.read);
                this.blur(this.sunrays, this.sunraysTemp, 1);
            }
        }

        gl.disable(gl.BLEND);
        this.drawColor(null, this.normalizeColor(state.BACK_COLOR));

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        
        switch (state.VIEW_MODE) {
            case 0: this.drawDisplayColor(solver, null); break;
            case 1: 
                this.drawDisplayPressure(solver, null);
                if (state.SHOW_VECTORS) this.drawVectors(solver, null);
                break;
            case 2: this.drawDisplayTemperature(solver, null); break;
        }
    }

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

        // REDIRECCIÓN: Enganchamos la textura visual (High-Res) al shader de color
        gl.uniform1i(this.displayColorProgram.uniforms.uObstacles, solver.obstaclesDisplay.read.attach(3));
        
        let bg = this.normalizeColor(state.BACK_COLOR);
        gl.uniform3f(this.displayColorProgram.uniforms.uObstacleColor, 1.0 - bg.r, 1.0 - bg.g, 1.0 - bg.b);

        blit(target);
    }

    drawDisplayPressure(solver, target) {
        this.displayPressureProgram.bind();
        gl.uniform1i(this.displayPressureProgram.uniforms.uPressure, solver.pressure.read.attach(0));
        gl.uniform1f(this.displayPressureProgram.uniforms.uContrast, state.PRESSURE_CONTRAST);
        blit(target);
    }

    drawDisplayTemperature(solver, target) {
        this.displayTempProgram.bind();
        gl.uniform1i(this.displayTempProgram.uniforms.uTexture, solver.dye.read.attach(0));
        gl.uniform1f(this.displayTempProgram.uniforms.uAmbientTemperature, state.AMBIENT_TEMPERATURE);
        blit(target);
    }

    drawVectors(solver, target) {
        let width = target ? target.width : gl.drawingBufferWidth;
        let height = target ? target.height : gl.drawingBufferHeight;
        gl.viewport(0, 0, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);

        this.vectorProgram.bind();
        gl.uniform1i(this.vectorProgram.uniforms.uVelocity, solver.velocity.read.attach(0));
        gl.uniform1f(this.vectorProgram.uniforms.uAspectRatio, width / height);

        gl.bindVertexArray(this.vectorVao);
        gl.drawArrays(gl.LINES, 0, this.vectorCount);
        gl.bindVertexArray(null);
    }

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

    applySunrays(source, mask, destination, obstaclesText) {
        gl.disable(gl.BLEND);
        this.sunraysMaskProgram.bind();
        gl.uniform1i(this.sunraysMaskProgram.uniforms.uTexture, source.attach(0));
        gl.uniform1i(this.sunraysMaskProgram.uniforms.uObstacles, obstaclesText.attach(1));
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
        gl.uniform4f(this.colorProgram.uniforms.color, color.r, color.g, color.b, 1.0);
        blit(target);
    }

    normalizeColor(input) {
        return { r: input.r / 255.0, g: input.g / 255.0, b: input.b / 255.0 };
    }
}