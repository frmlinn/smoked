import { state } from '../conf.js';

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

    _updatePointerMoveData(pointer, posX, posY) {
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.texcoordX = posX / this.canvas.width;
        pointer.texcoordY = 1.0 - posY / this.canvas.height;
        pointer.deltaX = this._correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
        pointer.deltaY = this._correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
        pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    }

    _updatePointerUpData(pointer) {
        pointer.down = false;
    }

    _correctDeltaX(delta) {
        let aspectRatio = this.canvas.width / this.canvas.height;
        if (aspectRatio < 1) delta *= aspectRatio;
        return delta;
    }

    _correctDeltaY(delta) {
        let aspectRatio = this.canvas.width / this.canvas.height;
        if (aspectRatio > 1) delta /= aspectRatio;
        return delta;
    }

    _scaleByPixelRatio(input) {
        const pixelRatio = window.devicePixelRatio || 1;
        return Math.floor(input * pixelRatio);
    }

    _bindEvents() {
        this.canvas.addEventListener('mousedown', e => {
            let posX = this._scaleByPixelRatio(e.offsetX);
            let posY = this._scaleByPixelRatio(e.offsetY);
            let pointer = this.pointers.find(p => p.id === -1);
            if (!pointer) {
                pointer = this._createPointer();
                this.pointers.push(pointer);
            }
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
            const touches = e.targetTouches;
            while (touches.length >= this.pointers.length) {
                this.pointers.push(this._createPointer());
            }
            for (let i = 0; i < touches.length; i++) {
                let posX = this._scaleByPixelRatio(touches[i].pageX);
                let posY = this._scaleByPixelRatio(touches[i].pageY);
                this._updatePointerDownData(this.pointers[i + 1], touches[i].identifier, posX, posY);
            }
        });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const touches = e.targetTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers[i + 1];
                if (!pointer.down) continue;
                let posX = this._scaleByPixelRatio(touches[i].pageX);
                let posY = this._scaleByPixelRatio(touches[i].pageY);
                this._updatePointerMoveData(pointer, posX, posY);
            }
        }, false);

        window.addEventListener('touchend', e => {
            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers.find(p => p.id === touches[i].identifier);
                if (pointer) this._updatePointerUpData(pointer);
            }
        });
    }

    // Utilidades de color
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