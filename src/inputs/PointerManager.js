import { state } from '../conf.js';

/**
 * @typedef {Object} Pointer
 * @property {number} id - Unique identifier for the touch or mouse event (-1 for inactive mouse).
 * @property {number} texcoordX - Normalized X coordinate [0.0, 1.0].
 * @property {number} texcoordY - Normalized Y coordinate [0.0, 1.0] (inverted for WebGL).
 * @property {number} prevTexcoordX - Previous normalized X coordinate.
 * @property {number} prevTexcoordY - Previous normalized Y coordinate.
 * @property {number} deltaX - Change in X coordinate, corrected by aspect ratio.
 * @property {number} deltaY - Change in Y coordinate, corrected by aspect ratio.
 * @property {boolean} down - Indicates whether the pointer is currently pressed.
 * @property {boolean} moved - Indicates whether the pointer has moved.
 * @property {{r: number, g: number, b: number}} color - The RGB color assigned to the pointer.
 */

/**
 * Manages mouse and multi-touch input events, mapping physical coordinates to WebGL texture coordinates.
 */
export class PointerManager {
    /**
     * Initializes the PointerManager and binds input events.
     * @param {HTMLCanvasElement} canvas - The target canvas element.
     */
    constructor(canvas) {
        this.canvas = canvas;
        /** @type {Pointer[]} Array of active and inactive pointers. */
        this.pointers = [this._createPointer()];
        /** @type {number[]} Stack used to trigger multiple random splats. */
        this.splatStack = [];
        
        this._bindEvents();
    }

    /**
     * Creates a default pointer object.
     * @private
     * @returns {Pointer} A newly initialized pointer object.
     */
    _createPointer() {
        return {
            id: -1,
            texcoordX: 0,
            texcoordY: 0,
            prevTexcoordX: 0,
            prevTexcoordY: 0,
            deltaX: 0,
            deltaY: 0,
            down: false,
            moved: false,
            color: this.generateColor()
        };
    }

    /**
     * Updates pointer state upon a down/press event.
     * @private
     * @param {Pointer} pointer - The pointer object to update.
     * @param {number} id - The event identifier.
     * @param {number} posX - Physical X coordinate.
     * @param {number} posY - Physical Y coordinate.
     */
    _updatePointerDownData(pointer, id, posX, posY) {
        pointer.id = id;
        pointer.down = true;
        pointer.moved = false;
        pointer.texcoordX = posX / this.canvas.width;
        pointer.texcoordY = 1.0 - posY / this.canvas.height;
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.deltaX = 0;
        pointer.deltaY = 0;
        pointer.color = this.generateColor();
    }

    /**
     * Updates pointer state upon a move event.
     * @private
     * @param {Pointer} pointer - The pointer object to update.
     * @param {number} posX - Physical X coordinate.
     * @param {number} posY - Physical Y coordinate.
     */
    _updatePointerMoveData(pointer, posX, posY) {
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.texcoordX = posX / this.canvas.width;
        pointer.texcoordY = 1.0 - posY / this.canvas.height;
        pointer.deltaX = this._correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
        pointer.deltaY = this._correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
        pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    }

    /**
     * Updates pointer state upon an up/release event.
     * @private
     * @param {Pointer} pointer - The pointer object to update.
     */
    _updatePointerUpData(pointer) {
        pointer.down = false;
    }

    /**
     * Corrects the X delta based on canvas aspect ratio.
     * @private
     * @param {number} delta - The raw X delta.
     * @returns {number} The corrected X delta.
     */
    _correctDeltaX(delta) {
        let aspectRatio = this.canvas.width / this.canvas.height;
        if (aspectRatio < 1) delta *= aspectRatio;
        return delta;
    }

    /**
     * Corrects the Y delta based on canvas aspect ratio.
     * @private
     * @param {number} delta - The raw Y delta.
     * @returns {number} The corrected Y delta.
     */
    _correctDeltaY(delta) {
        let aspectRatio = this.canvas.width / this.canvas.height;
        if (aspectRatio > 1) delta /= aspectRatio;
        return delta;
    }

    /**
     * Scales an input coordinate by the device pixel ratio.
     * @private
     * @param {number} input - The coordinate to scale.
     * @returns {number} The scaled coordinate.
     */
    _scaleByPixelRatio(input) {
        const pixelRatio = window.devicePixelRatio || 1;
        return Math.floor(input * pixelRatio);
    }

    /**
     * Binds mouse and touch DOM events to the canvas.
     * @private
     */
    _bindEvents() {
        this.canvas.addEventListener('mousedown', e => {
            let posX = this._scaleByPixelRatio(e.offsetX);
            let posY = this._scaleByPixelRatio(e.offsetY);
            let pointer = this.pointers[0];
            this._updatePointerDownData(pointer, -1, posX, posY);
        });

        this.canvas.addEventListener('mousemove', e => {
            let pointer = this.pointers[0];
            if (!pointer.down) return;
            let posX = this._scaleByPixelRatio(e.offsetX);
            let posY = this._scaleByPixelRatio(e.offsetY);
            this._updatePointerMoveData(pointer, posX, posY);
        });

        window.addEventListener('mouseup', () => {
            this._updatePointerUpData(this.pointers[0]);
        });

        this.canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers.slice(1).find(p => p.id === -1);
                
                if (!pointer) {
                    pointer = this._createPointer();
                    this.pointers.push(pointer);
                }
                
                let posX = this._scaleByPixelRatio(touches[i].clientX);
                let posY = this._scaleByPixelRatio(touches[i].clientY);
                this._updatePointerDownData(pointer, touches[i].identifier, posX, posY);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers.find(p => p.id === touches[i].identifier);
                if (!pointer || !pointer.down) continue;
                
                let posX = this._scaleByPixelRatio(touches[i].clientX);
                let posY = this._scaleByPixelRatio(touches[i].clientY);
                this._updatePointerMoveData(pointer, posX, posY);
            }
        }, { passive: false });

        window.addEventListener('touchend', e => {
            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers.find(p => p.id === touches[i].identifier);
                if (pointer) {
                    this._updatePointerUpData(pointer);
                    pointer.id = -1;
                }
            }
        });

        window.addEventListener('touchcancel', e => {
            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers.find(p => p.id === touches[i].identifier);
                if (pointer) {
                    this._updatePointerUpData(pointer);
                    pointer.id = -1;
                }
            }
        });
    }

    /**
     * Generates a random darkened RGB color.
     * @returns {{r: number, g: number, b: number}} The generated color object.
     */
    generateColor() {
        let c = this.HSVtoRGB(Math.random(), 1.0, 1.0);
        c.r *= 0.15;
        c.g *= 0.15;
        c.b *= 0.15;
        return c;
    }

    /**
     * Converts HSV color values to RGB.
     * @param {number} h - Hue [0.0, 1.0].
     * @param {number} s - Saturation [0.0, 1.0].
     * @param {number} v - Value [0.0, 1.0].
     * @returns {{r: number, g: number, b: number}} RGB color object.
     */
    HSVtoRGB(h, s, v) {
        let r, g, b, i, f, p, q, t;
        i = Math.floor(h * 6);
        f = h * 6 - i;
        p = v * (1 - s);
        q = v * (1 - f * s);
        t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return { r, g, b };
    }
}