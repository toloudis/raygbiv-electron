#version 450

layout(location = 0) in vec3 position;

layout(set = 0, binding = 0) uniform UBO {
  mat4 modelViewMatrix;
  mat4 projectionMatrix;
};

layout(location = 0) out vec3 pObj;

void main() {
  pObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
