precision mediump float;

varying vec3 v_worldPos;
varying vec2 v_texcoord;
varying vec3 v_normal;

uniform vec3 u_campos;
uniform vec3 u_lightDirection;
uniform samplerCube env_map;

uniform float u_twave_begin;
uniform float u_time;
uniform float u_amp;
uniform float u_rr;

const float iof_water = 1.33;
const float discrete = 0.001;

const float lambda = 10.0;
const float lambda2 = 10.0;

float time() {
    return u_time - u_twave_begin;
}

float wave_height(vec2 point) {
    float n = length(point - vec2(0.5));
    return u_amp * exp(-lambda2 * (n + time())) * cos(lambda * n + time());
}

float dwdn(vec2 point) {
    float n = length(point - vec2(0.5));
    return -u_amp * lambda * lambda2 * exp(-lambda2 * (n + time())) * sin(lambda * n + time());
}

vec3 calc_world_pos() {
    return (wave_height(v_texcoord) * v_normal) + v_worldPos;
}

vec3 calc_wave_normal() {
    vec3 dir = normalize(vec3(v_texcoord.x - 0.5, 0.0, v_texcoord.y - 0.5));
    vec3 tangent = normalize(vec3(dir.x, dwdn(v_texcoord), dir.z));
    vec3 aug = dot(v_normal, tangent) * tangent;

    return normalize(v_normal - aug);
}

vec3 snell_law(vec3 incident, vec3 normal, float ratio) {
    float cos_angle = dot(normal, incident);
    float sin2_angle = (1.0 - cos_angle * cos_angle);
    float inv_lhs2 = 1.0 - ratio * ratio * sin2_angle;

    if (inv_lhs2 < 0.0)
        return vec3(0.0);
    else
        return ratio * incident - (ratio * cos_angle + sqrt(inv_lhs2)) * normal;
}

void main() {
    vec3 normal = calc_wave_normal();
    vec3 worldPos = calc_world_pos();

    float lightAmt = dot(u_lightDirection, normal);
    lightAmt = clamp(lightAmt, 0.1, 1.0);
    vec3 dirToFragment = normalize(worldPos - u_campos);

    vec3 refractedDir = snell_law(dirToFragment, normal, 1.0 / iof_water);
    vec3 reflectedDir = reflect(dirToFragment, normal);

    vec4 refract_color = textureCube(env_map, refractedDir);
    vec4 reflect_color = textureCube(env_map, reflectedDir);

    gl_FragColor = vec4(lightAmt, lightAmt, lightAmt, 1.0) * mix(refract_color, reflect_color, u_rr);
}