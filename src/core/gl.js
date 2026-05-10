/**
 * @type {WebGL2RenderingContext} WebGL context instance.
 */
export let gl;

/**
 * @typedef {Object} WebGLExtensions
 * @property {boolean} supportLinearFiltering - Indicates if linear filtering for half-float is supported.
 * @property {number} halfFloatTexType - WebGL half-float type constant.
 * @property {Object} formatRGBA - RGBA texture format mapping.
 * @property {Object} formatRG - RG texture format mapping.
 * @property {Object} formatR - Single channel (Red) texture format mapping.
 */

/**
 * @type {WebGLExtensions} WebGL extensions and format configurations.
 */
export let ext;

/**
 * @type {WebGLVertexArrayObject} VAO used for full-screen quad rendering.
 * @private
 */
let blitVao;

/**
 * Initializes the WebGL2 context, required extensions, and the blit VAO.
 * @param {HTMLCanvasElement} canvas - The target canvas element.
 * @throws {Error} If WebGL2 is not supported.
 */
export function initWebGL(canvas) {
    const params = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    gl = canvas.getContext('webgl2', params);

    if (!gl) {
        throw new Error('WebGL 2 no está soportado en este navegador.');
    }

    gl.getExtension('EXT_color_buffer_float');

    ext = {
        supportLinearFiltering: true, 
        halfFloatTexType: gl.HALF_FLOAT,
        formatRGBA: { internalFormat: gl.RGBA16F, format: gl.RGBA },
        formatRG: { internalFormat: gl.RG16F, format: gl.RG },
        formatR: { internalFormat: gl.R16F, format: gl.RED }
    };

    blitVao = gl.createVertexArray();
    gl.bindVertexArray(blitVao);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    gl.bindVertexArray(null);
}

/**
 * Renders a full-screen quad to a target FBO or the default framebuffer.
 * @param {FBO|null} target - The destination FBO, or null for the screen.
 * @param {boolean} [clear=false] - Whether to clear the color buffer before drawing.
 */
export function blit(target, clear = false) {
    if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }

    if (clear) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.bindVertexArray(blitVao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
}