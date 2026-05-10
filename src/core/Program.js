import { gl } from './gl.js';

/**
 * WebGL Shader Program wrapper.
 */
export class Program {
    /**
     * Compiles and links a WebGL program from shader sources.
     * @param {string} vertexShaderSource - Source code for the vertex shader.
     * @param {string} fragmentShaderSource - Source code for the fragment shader.
     */
    constructor(vertexShaderSource, fragmentShaderSource) {
        this.uniforms = {};
        this.program = this._createProgram(vertexShaderSource, fragmentShaderSource);
        this._extractUniforms();
    }

    /**
     * Internal method to link vertex and fragment shaders into a program.
     * @private
     * @param {string} vertexSource - Vertex shader source.
     * @param {string} fragmentSource - Fragment shader source.
     * @returns {WebGLProgram} The linked WebGL program.
     */
    _createProgram(vertexSource, fragmentSource) {
        const vertexShader = this._compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            throw new Error('Error en el enlazado del Program');
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return program;
    }

    /**
     * Internal method to compile a shader.
     * @private
     * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER.
     * @param {string} source - Shader source code.
     * @returns {WebGLShader} The compiled WebGL shader.
     */
    _compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            throw new Error('Error al compilar el Shader en Program');
        }
        return shader;
    }

    /**
     * Extracts and caches active uniforms from the linked program.
     * @private
     */
    _extractUniforms() {
        const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const uniformName = gl.getActiveUniform(this.program, i).name;
            const cleanName = uniformName.replace(/\[0\]$/, '');
            this.uniforms[cleanName] = gl.getUniformLocation(this.program, uniformName);
        }
    }

    /**
     * Binds the program for execution.
     */
    bind() {
        gl.useProgram(this.program);
    }
}