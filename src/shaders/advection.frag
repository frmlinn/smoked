#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;

out vec4 fragColor;

void main() {
    vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
    vec4 result = texture(uSource, coord);
    float d1 = 1.0 / (1.0 + dissipation * dt);
    float d2 = 1.0 / (1.0 + dissipation * 0.2 * dt);
    fragColor = result * vec4(d1, d1, d1, d2);
}