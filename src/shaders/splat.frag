#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec4 color;
uniform vec2 point;
uniform float radius;

out vec4 fragColor;

void main() {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec4 splat = exp(-dot(p, p) / radius) * color;
    vec4 base = texture(uTarget, vUv);
    fragColor = vec4(base.rgb + splat.rgb * 1.5, min(base.a + splat.a, 5.0));
}