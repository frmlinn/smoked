#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;

uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform vec2 texelSize;
uniform float dt;

uniform float curl;
uniform float buoyancy;
uniform float weight;
uniform float ambientTemperature;

out vec4 fragColor;

float computeCurl(vec2 uv) {
    float L = texture(uVelocity, uv - vec2(texelSize.x, 0.0)).y;
    float R = texture(uVelocity, uv + vec2(texelSize.x, 0.0)).y;
    float T = texture(uVelocity, uv + vec2(0.0, texelSize.y)).x;
    float B = texture(uVelocity, uv - vec2(0.0, texelSize.y)).x;
    return 0.5 * (R - L - T + B);
}

void main() {
    vec2 velocity = texture(uVelocity, vUv).xy;

    if (curl > 0.0) {
        float cC = computeCurl(vUv);
        float cL = computeCurl(vL);
        float cR = computeCurl(vR);
        float cT = computeCurl(vT);
        float cB = computeCurl(vB);

        vec2 force = 0.5 * vec2(abs(cT) - abs(cB), abs(cR) - abs(cL));
        force /= length(force) + 0.0001;
        force *= curl * cC;
        force.y *= -1.0;

        velocity += force * dt;
    }

    if (buoyancy > 0.0 || weight > 0.0) {
        vec4 dye = texture(uDye, vUv);
        float temperature = dye.a;
        float density = max(dye.r, max(dye.g, dye.b));
        
        float tempDiff = temperature - ambientTemperature;
        float forceY = (tempDiff * buoyancy) - (density * weight);
        float activeMask = step(0.005, max(density, temperature));
        
        velocity.y += forceY * dt * 50.0 * activeMask;
    }

    velocity = min(max(velocity, -1000.0), 1000.0);
    fragColor = vec4(velocity, 0.0, 1.0);
}