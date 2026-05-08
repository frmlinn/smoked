#version 300 es
precision mediump float;
precision mediump sampler2D;

in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uTexture;
uniform float intensity;

out vec4 fragColor;

void main () {
    vec4 sum = vec4(0.0);
    sum += texture(uTexture, vL);
    sum += texture(uTexture, vR);
    sum += texture(uTexture, vT);
    sum += texture(uTexture, vB);
    sum *= 0.25;
    fragColor = sum * intensity;
}