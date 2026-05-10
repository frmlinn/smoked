import { FBO } from './FBO.js';
import { GLResource } from './GLResource.js';

export class DoubleFBO extends GLResource {
    constructor(w, h, internalFormat, format, type, param) {
        super();
        this.read = new FBO(w, h, internalFormat, format, type, param);
        this.write = new FBO(w, h, internalFormat, format, type, param);
    }

    get width() { return this.read.width; }
    get height() { return this.read.height; }
    get texelSizeX() { return this.read.texelSizeX; }
    get texelSizeY() { return this.read.texelSizeY; }

    swap() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
    }

    resize(w, h) {
        this.read.resize(w, h);
        this.write.resize(w, h);
    }

    release() {
        this.read.release();
        this.write.release();
    }
}