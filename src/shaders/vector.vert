#version 300 es
precision highp float;
precision highp sampler2D;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aDir;

uniform sampler2D uVelocity;
uniform float uAspectRatio;

out float vMagnitude;

void main() {
    vec2 uv = aPosition * 0.5 + 0.5;
    vec2 vel = texture(uVelocity, uv).xy;
    vMagnitude = length(vel);
    vec2 dir = vel / (vMagnitude + 0.0001);
    dir.x /= uAspectRatio;
    float len = clamp(vMagnitude * 0.0005, 0.002, 0.05);
    vec2 pos = aPosition + dir * len * aDir * step(0.001, vMagnitude);
    gl_Position = vec4(pos, 0.0, 1.0);
}