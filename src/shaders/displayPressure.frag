#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uPressure;
uniform float uContrast;

out vec4 fragColor;

void main () {
    float p = texture(uPressure, vUv).x;
    vec3 color = vec3(max(p * uContrast, 0.0), 0.0, max(-p * uContrast, 0.0));
    
    fragColor = vec4(color, 1.0);
}