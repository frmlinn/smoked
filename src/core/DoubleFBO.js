import { FBO } from './FBO.js';

export class DoubleFBO {
    constructor(w, h, internalFormat, format, type, param) {
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
}