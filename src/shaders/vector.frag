#version 300 es
precision highp float;

in float vMagnitude;
out vec4 fragColor;

void main() {
    float m = smoothstep(0.0, 800.0, vMagnitude);
    vec3 color = mix(vec3(0.0, 0.6, 1.0), vec3(1.0, 0.1, 0.1), m);
    fragColor = vec4(color, 1.0);
}