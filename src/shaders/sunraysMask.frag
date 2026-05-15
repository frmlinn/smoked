#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uTexture;
uniform sampler2D uObstacles;

out vec4 fragColor;
void main () {
    vec4 c = texture(uTexture, vUv);
    float br = max(c.r, max(c.g, c.b));
    
    c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
    
    float obs = texture(uObstacles, vUv).x;
    c.a *= (1.0 - obs);

    fragColor = c;
}