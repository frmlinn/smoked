import { FBO } from './FBO.js';
import { GLResource } from './GLResource.js';

/**
 * A double-buffered FBO setup for ping-pong rendering operations.
 * @extends GLResource
 */
export class DoubleFBO extends GLResource {
    /**
     * Creates a DoubleFBO consisting of a read and a write FBO.
     * @param {number} w - Width in pixels.
     * @param {number} h - Height in pixels.
     * @param {number} internalFormat - WebGL internal texture format.
     * @param {number} format - WebGL texture format.
     * @param {number} type - WebGL data type.
     * @param {number} param - WebGL texture filtering parameter.
     */
    constructor(w, h, internalFormat, format, type, param) {
        super();
        this.read = new FBO(w, h, internalFormat, format, type, param);
        this.write = new FBO(w, h, internalFormat, format, type, param);
    }

    /** @returns {number} The width of the FBO. */
    get width() { return this.read.width; }
    /** @returns {number} The height of the FBO. */
    get height() { return this.read.height; }
    /** @returns {number} The texel size on the X axis. */
    get texelSizeX() { return this.read.texelSizeX; }
    /** @returns {number} The texel size on the Y axis. */
    get texelSizeY() { return this.read.texelSizeY; }

    /**
     * Swaps the read and write framebuffers.
     */
    swap() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
    }

    /**
     * Resizes both read and write framebuffers.
     * @param {number} w - New width.
     * @param {number} h - New height.
     */
    resize(w, h) {
        this.read.resize(w, h);
        this.write.resize(w, h);
    }

    /**
     * Releases both read and write framebuffers from GPU memory.
     */
    release() {
        this.read.release();
        this.write.release();
    }
}