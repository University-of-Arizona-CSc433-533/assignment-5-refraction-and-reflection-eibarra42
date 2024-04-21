attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;

varying vec3 v_worldPos;
varying vec2 v_texcoord;
varying vec3 v_normal;

uniform mat4 u_worldViewProjection;

void main() {
    v_worldPos = a_position.xyz;
    // Sending the interpolated normal to the fragment shader.
    v_normal = a_normal;
    // Pass the texcoord to the fragment shader.
    v_texcoord = a_texcoord;
    // Multiply the position by the matrix.
    gl_Position = u_worldViewProjection * a_position;
}