export let gl;
export let ext;

let blitVao;

export function initWebGL(canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    gl = canvas.getContext('webgl2', params);

    if (!gl) {
        throw new Error('WebGL 2 no está soportado en este navegador.');
    }

    gl.getExtension('EXT_color_buffer_float');
    
    gl.getExtension('OES_texture_float_linear');

    ext = {
        supportLinearFiltering: true,
        halfFloatTexType: gl.HALF_FLOAT,
        formatRGBA: { internalFormat: gl.RGBA16F, format: gl.RGBA },
        formatRG: { internalFormat: gl.RG16F, format: gl.RG },
        formatR: { internalFormat: gl.R16F, format: gl.RED }
    };

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

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