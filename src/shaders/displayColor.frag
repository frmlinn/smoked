#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;

uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform sampler2D uSunrays;
uniform vec2 texelSize;

uniform bool uEnableShading;
uniform bool uEnableBloom;
uniform bool uEnableSunrays;

uniform sampler2D uObstacles;
uniform vec3 uObstacleColor;

out vec4 fragColor;

vec3 linearToGamma (vec3 color) {
    color = max(color, vec3(0));
    return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
}

void main () {
    vec3 c = texture(uTexture, vUv).rgb;
    if (uEnableShading) {
        vec3 lc = texture(uTexture, vL).rgb;
        vec3 rc = texture(uTexture, vR).rgb;
        vec3 tc = texture(uTexture, vT).rgb;
        vec3 bc = texture(uTexture, vB).rgb;

        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);
        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);
        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;
    }

    vec3 bloom = vec3(0.0);
    if (uEnableBloom) {
        bloom = texture(uBloom, vUv).rgb;
    }

    if (uEnableSunrays) {
        float sunrays = texture(uSunrays, vUv).r;
        c *= sunrays;
        if (uEnableBloom) {
            bloom *= sunrays;
        }
    }

    if (uEnableBloom) {
        bloom = linearToGamma(bloom);
        c += bloom;
    }

    float obs = texture(uObstacles, vUv).x;
    c = mix(c, uObstacleColor, obs);

    float a = max(c.r, max(c.g, c.b));
    a = max(a, obs);

    fragColor = vec4(c, a);
}