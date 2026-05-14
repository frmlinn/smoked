#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uTexture;
uniform float uAmbientTemperature;

out vec4 fragColor;

void main() {
    float temp = texture(uTexture, vUv).a;
    float diff = temp - uAmbientTemperature;
    
    float hot = max(diff, 0.0);
    float cold = max(-diff, 0.0);
    
    vec3 color = vec3(1.0, 0.4, 0.1) * hot + vec3(0.0, 0.5, 1.0) * cold;
    
    fragColor = vec4(min(color * 1.5, vec3(1.0)), 1.0);
}