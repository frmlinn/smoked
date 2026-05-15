#version 300 es
precision mediump float;
precision mediump sampler2D;

in highp vec2 vUv;
in highp vec2 vL;
in highp vec2 vR;
in highp vec2 vT;
in highp vec2 vB;

uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;

out vec4 fragColor;

void main () {
    float L = texture(uPressure, vL).x;
    float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x;
    float B = texture(uPressure, vB).x;
    float C = texture(uPressure, vUv).x;

    float obsL = texture(uObstacles, vL).x;
    float obsR = texture(uObstacles, vR).x;
    float obsT = texture(uObstacles, vT).x;
    float obsB = texture(uObstacles, vB).x;

    L = mix(L, C, obsL);
    R = mix(R, C, obsR);
    T = mix(T, C, obsT);
    B = mix(B, C, obsB);

    vec2 velocity = texture(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);

    float obsC = texture(uObstacles, vUv).x;
    velocity *= (1.0 - obsC);

    fragColor = vec4(velocity, 0.0, 1.0);
}