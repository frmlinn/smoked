import { gl } from './gl.js';
import { GLResource } from './GLResource.js';

export class FBO extends GLResource {
    constructor(w, h, internalFormat, format, type, param) {
        super();
        this.internalFormat = internalFormat;
        this.format = format;
        this.type = type;
        this.param = param;
        
        this._createResources(w, h);
    }

    _createResources(w, h) {
        this.width = w;
        this.height = h;
        this.texelSizeX = 1.0 / w;
        this.texelSizeY = 1.0 / h;

        gl.activeTexture(gl.TEXTURE0);
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, w, h, 0, this.format, this.type, null);

        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

        gl.viewport(0, 0, w, h);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    resize(w, h) {
        if (this.width === w && this.height === h) return;
        
        this.release();
        this._createResources(w, h);
    }

    release() {
        if (this.texture) {
            gl.deleteTexture(this.texture);
            this.texture = null;
        }
        if (this.fbo) {
            gl.deleteFramebuffer(this.fbo);
            this.fbo = null;
        }
    }

    attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        return id;
    }
}