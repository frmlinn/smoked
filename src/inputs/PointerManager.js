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
 * Optimized for full-screen CSS layouts to avoid Layout Thrashing.
 */
export class PointerManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.pointers = [this._createPointer()];
        this.splatStack = [];
        
        this._bindEvents();
    }

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

    _updatePointerDownData(pointer, id, clientX, clientY) {
        pointer.id = id;
        pointer.down = true;
        pointer.moved = false;
        pointer.texcoordX = clientX / window.innerWidth;
        pointer.texcoordY = 1.0 - (clientY / window.innerHeight);
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.deltaX = 0;
        pointer.deltaY = 0;
        pointer.color = this.generateColor();
    }

    _updatePointerMoveData(pointer, clientX, clientY) {
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.texcoordX = clientX / window.innerWidth;
        pointer.texcoordY = 1.0 - (clientY / window.innerHeight);
        pointer.deltaX = this._correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
        pointer.deltaY = this._correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
        pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    }

    _updatePointerUpData(pointer) {
        pointer.down = false;
    }

    _correctDeltaX(delta) {
        let aspectRatio = window.innerWidth / window.innerHeight;
        if (aspectRatio < 1) delta *= aspectRatio;
        return delta;
    }

    _correctDeltaY(delta) {
        let aspectRatio = window.innerWidth / window.innerHeight;
        if (aspectRatio > 1) delta /= aspectRatio;
        return delta;
    }

    _bindEvents() {
        this.canvas.addEventListener('mousedown', e => {
            let pointer = this.pointers[0];
            this._updatePointerDownData(pointer, -1, e.clientX, e.clientY);
        });

        this.canvas.addEventListener('mousemove', e => {
            let pointer = this.pointers[0];
            if (!pointer.down) return;
            this._updatePointerMoveData(pointer, e.clientX, e.clientY);
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
                
                this._updatePointerDownData(pointer, touches[i].identifier, touches[i].clientX, touches[i].clientY);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers.find(p => p.id === touches[i].identifier);
                if (!pointer || !pointer.down) continue;
                
                this._updatePointerMoveData(pointer, touches[i].clientX, touches[i].clientY);
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

    generateColor() {
        let c = this.HSVtoRGB(Math.random(), 1.0, 1.0);
        c.r *= 0.15;
        c.g *= 0.15;
        c.b *= 0.15;
        return c;
    }

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