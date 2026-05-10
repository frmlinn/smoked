/**
 * Abstract base class for WebGL resources.
 * @abstract
 */
export class GLResource {
    constructor() {
        if (new.target === GLResource) {
            throw new TypeError("Cannot instantiate abstract class GLResource directly.");
        }
    }

    /**
     * Resizes the resource. Must be implemented by subclasses.
     * @param {number} width - The new width.
     * @param {number} height - The new height.
     * @throws {Error} If not implemented.
     */
    resize(width, height) {
        throw new Error("Method resize(width, height) must be implemented by the subclass.");
    }

    /**
     * Releases the resource. Must be implemented by subclasses.
     * @throws {Error} If not implemented.
     */
    release() {
        throw new Error("Method release() must be implemented by the subclass.");
    }

    /**
     * Initializes or resizes a WebGL resource.
     * @param {GLResource|null} target - The existing resource or null.
     * @param {Function} ResourceClass - The class to instantiate if target is null.
     * @param {number} w - Width.
     * @param {number} h - Height.
     * @param {number} internalFormat - WebGL internal format.
     * @param {number} format - WebGL format.
     * @param {number} type - WebGL data type.
     * @param {number} param - WebGL texture parameter (e.g., filtering).
     * @returns {GLResource} The initialized or resized resource.
     */
    static initOrResize(target, ResourceClass, w, h, internalFormat, format, type, param) {
        if (!target) {
            return new ResourceClass(w, h, internalFormat, format, type, param);
        }
        target.resize(w, h);
        return target;
    }
}