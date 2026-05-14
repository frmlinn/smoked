#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float ambientTemperature;
uniform float dt;
uniform float buoyancy;
uniform float weight;

out vec4 fragColor;

void main() {
    vec2 velocity = texture(uVelocity, vUv).xy;
    vec4 dye = texture(uDye, vUv);
    float temperature = dye.a;
    float density = max(dye.r, max(dye.g, dye.b));
    float tempDiff = temperature - ambientTemperature;
    float forceY = (tempDiff * buoyancy) - (density * weight);
    float activeMask = step(0.005, max(density, temperature));
    velocity.y += forceY * dt * 50.0 * activeMask;
    fragColor = vec4(velocity, 0.0, 1.0);
}