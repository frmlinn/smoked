#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;

uniform vec2 point; 
uniform vec2 prevPoint;
uniform float radius;
uniform float value;

out vec4 fragColor;

void main() {
    vec2 p = vUv;
    vec2 a = prevPoint;
    vec2 b = point;

    p.x *= aspectRatio;
    a.x *= aspectRatio;
    b.x *= aspectRatio;

    vec2 pa = p - a;
    vec2 ba = b - a;
    
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    vec2 d = pa - ba * h;
    
    float distSq = dot(d, d);
    float rSq = radius * radius;
    
    float brush = 1.0 - smoothstep(rSq * 0.64, rSq, distSq);
    
    float base = texture(uTarget, vUv).x;
    float finalValue;
    
    if (value > 0.5) {
        finalValue = max(base, brush);
    } else {
        finalValue = min(base, 1.0 - brush);
    }
    
    fragColor = vec4(finalValue, 0.0, 0.0, 1.0);
}