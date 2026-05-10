export class GLResource {
    constructor() {
        if (new.target === GLResource) {
            throw new TypeError("No se puede instanciar la clase abstracta GLResource directamente.");
        }
    }

    resize(width, height) {
        throw new Error("El método resize(width, height) debe ser implementado por la subclase.");
    }

    release() {
        throw new Error("El método release() debe ser implementado por la subclase.");
    }

    static initOrResize(target, ResourceClass, w, h, internalFormat, format, type, param) {
        if (!target) {
            return new ResourceClass(w, h, internalFormat, format, type, param);
        }
        target.resize(w, h);
        return target;
    }
}