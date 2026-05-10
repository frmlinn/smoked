import { gl, ext, blit } from '../core/gl.js';
import { GLResource } from '../core/GLResource.js';
import { Program } from '../core/Program.js';
import { FBO } from '../core/FBO.js';
import { DoubleFBO } from '../core/DoubleFBO.js';
import { shaders } from '../shaders/index.js';
import { state } from '../conf.js';

export class FluidSolver {
    constructor() {
        this.clearProgram           = new Program(shaders.baseVert, shaders.clearFrag);
        this.advectionProgram       = new Program(shaders.baseVert, shaders.advectionFrag);
        this.divergenceProgram      = new Program(shaders.baseVert, shaders.divergenceFrag);
        this.curlProgram            = new Program(shaders.baseVert, shaders.curlFrag);
        this.vorticityProgram       = new Program(shaders.baseVert, shaders.vorticityFrag);
        this.pressureProgram        = new Program(shaders.baseVert, shaders.pressureFrag);
        this.gradienSubtractProgram = new Program(shaders.baseVert, shaders.gradientSubtractFrag);
        
        this.splatProgram           = new Program(shaders.baseVert, shaders.splatFrag);

        this.dye = null;
        this.velocity = null;
        this.divergence = null;
        this.curl = null;
        this.pressure = null;

        this.initFramebuffers();
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

    step(dt) {
        gl.disable(gl.BLEND);

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

        this.divergenceProgram.bind();
        gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        blit(this.divergence);

        this.clearProgram.bind();
        gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
        gl.uniform1f(this.clearProgram.uniforms.value, state.PRESSURE);
        blit(this.pressure.write);
        this.pressure.swap();

        this.pressureProgram.bind();
        gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
        for (let i = 0; i < state.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
            blit(this.pressure.write);
            this.pressure.swap();
        }

        this.gradienSubtractProgram.bind();
        gl.uniform2f(this.gradienSubtractProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.gradienSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
        gl.uniform1i(this.gradienSubtractProgram.uniforms.uVelocity, this.velocity.read.attach(1));
        blit(this.velocity.write);
        this.velocity.swap();

        this.advectionProgram.bind();
        gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        let velocityId = this.velocity.read.attach(0);
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
        gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
        gl.uniform1f(this.advectionProgram.uniforms.dissipation, state.VELOCITY_DISSIPATION);
        blit(this.velocity.write);
        this.velocity.swap();

        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
        gl.uniform1f(this.advectionProgram.uniforms.dissipation, state.DENSITY_DISSIPATION);
        blit(this.dye.write);
        this.dye.swap();
    }

    splat(x, y, dx, dy, color) {
        this.splatProgram.bind();
        gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
        gl.uniform1f(this.splatProgram.uniforms.aspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight);
        gl.uniform2f(this.splatProgram.uniforms.point, x, y);
        gl.uniform3f(this.splatProgram.uniforms.color, dx, dy, 0.0);
        gl.uniform1f(this.splatProgram.uniforms.radius, this._correctRadius(state.SPLAT_RADIUS / 100.0));
        blit(this.velocity.write);
        this.velocity.swap();

        gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
        gl.uniform3f(this.splatProgram.uniforms.color, color.r, color.g, color.b);
        blit(this.dye.write);
        this.dye.swap();
    }

    _correctRadius(radius) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio > 1) radius *= aspectRatio;
        return radius;
    }
}