#version 450

layout(location = 0) in vec3 pObj;

layout(location = 0) out vec4 outputColour;

layout(set = 0, binding = 1) uniform sampler textureSampler;
layout(set = 0, binding = 2) uniform texture3D textureAtlas;

// uniform sampler2D lut;

layout(set = 0, binding = 3) uniform UBO {
  mat4 inverseModelViewMatrix;
  vec2 iResolution;
  float isPerspective;
  float orthoScale;
  float GAMMA_MIN;
  float GAMMA_MAX;
  float GAMMA_SCALE;
  float BRIGHTNESS;
  vec3 AABB_CLIP_MIN;
  float dataRangeMin; // 0..1 (mapped from 0..uint16_max)
  vec3 AABB_CLIP_MAX;
  float dataRangeMax; // 0..1 (mapped from 0..uint16_max)
  float maskAlpha;
  float DENSITY;
  int BREAK_STEPS;
};

#define M_PI 3.14159265358979323846

float powf(float a, float b) { return pow(a, b); }

float rand(vec2 co) {
  float threadId = gl_FragCoord.x / (gl_FragCoord.y + 1.0);
  float bigVal = threadId * 1299721.0 / 911.0;
  vec2 smallVal = vec2(threadId * 7927.0 / 577.0, threadId * 104743.0 / 1039.0);
  return fract(sin(dot(co, smallVal)) * bigVal);
}

vec4 luma2Alpha(vec4 color, float vmin, float vmax, float C) {
  float x = max(color[2], max(color[0], color[1]));
  float xi = (x - vmin) / (vmax - vmin);
  xi = clamp(xi, 0.0, 1.0);
  float y = pow(xi, C);
  y = clamp(y, 0.0, 1.0);
  color[3] = y;
  return (color);
}

vec4 sampleAs3DTexture(vec4 pos) {
  float bounds = float(pos[0] > 0.001 && pos[0] < 0.999 && pos[1] > 0.001 &&
                       pos[1] < 0.999 && pos[2] > 0.001 && pos[2] < 0.999);

  vec4 texval =
      vec4(textureLod(sampler3D(textureAtlas, textureSampler), pos.xyz, 0).r);
  vec4 retval = vec4(texval.rgb, 1.0);

  //    float texval = textureLod(tex, pos.xyz, 0).r;
  //	texval = (texval - dataRangeMin) / (dataRangeMax - dataRangeMin);
  //	vec4 retval = vec4(texval, texval, texval, 1.0);
  return bounds * retval;
}

vec4 sampleStack(vec4 pos) {
  vec4 col = sampleAs3DTexture(pos);
  col = luma2Alpha(col, GAMMA_MIN, GAMMA_MAX, GAMMA_SCALE);
  return col;
}

//->intersect AXIS-ALIGNED box routine
//
bool intersectBox(in vec3 r_o, in vec3 r_d, in vec3 boxMin, in vec3 boxMax,
                  out float tnear, out float tfar) {
  vec3 invR = vec3(1.0, 1.0, 1.0) / r_d;
  vec3 tbot = invR * (boxMin - r_o);
  vec3 ttop = invR * (boxMax - r_o);
  vec3 tmin = min(ttop, tbot);
  vec3 tmax = max(ttop, tbot);
  float largest_tmin = max(max(tmin.x, tmin.y), max(tmin.x, tmin.z));
  float smallest_tmax = min(min(tmax.x, tmax.y), min(tmax.x, tmax.z));
  tnear = largest_tmin;
  tfar = smallest_tmax;
  return (smallest_tmax > largest_tmin);
}

vec4 integrateVolume(vec4 eye_o, vec4 eye_d, float tnear, float tfar,
                     float clipNear, float clipFar) {
  vec4 C = vec4(0.0);
  float tend = min(tfar, clipFar);
  float tbegin = tnear;
  const int maxSteps = 512;
  float csteps = clamp(float(BREAK_STEPS), 1.0, float(maxSteps));
  float invstep = 1.0 / csteps;
  float r = 0.5 - 1.0 * rand(eye_d.xy);
  float tstep = invstep;
  float tfarsurf = r * tstep;
  float overflow = mod((tfarsurf - tend), tstep);
  float t = tbegin + overflow;
  t += r * tstep;
  float tdist = 0.0;
  int numSteps = 0;

  vec4 pos, col;
  float s = 0.5 * float(maxSteps) / csteps;
  for (int i = 0; i < maxSteps; i++) {
    pos = eye_o + eye_d * t;
    pos.xyz = (pos.xyz + 0.5); // 0.5 * (pos + 1.0); // map position from
                               // [boxMin, boxMax] to [0, 1] coordinates
    col = sampleStack(pos);

    // Finish up by adding brightness/density
    col.xyz *= BRIGHTNESS;
    col.w *= DENSITY;
    float stepScale = (1.0 - powf((1.0 - col.w), s));
    col.w = stepScale;
    col.xyz *= col.w;
    col = clamp(col, 0.0, 1.0);

    C = (1.0 - C.w) * col + C;
    t += tstep;
    numSteps = i;
    if (t > tend)
      break;
    if (C.w > 1.0)
      break;
  }
  return C;
}
void main() {
  outputColour = vec4(1.0, 0.0, 0.0, 1.0);

  vec2 vUv = gl_FragCoord.xy / iResolution.xy;

  vec3 eyeRay_o, eyeRay_d;
  if (isPerspective != 0.0) {
    // put ray in object space (which is the 0-1 range of the cube coordinates)
    // transform view space 0,0,0 (the eye position) into model (object) space
    eyeRay_o = (inverseModelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    // pObj is already in object space
    eyeRay_d = normalize(pObj - eyeRay_o);
  } else {
    float zDist = 2.0;
    eyeRay_d = (inverseModelViewMatrix * vec4(0.0, 0.0, -zDist, 0.0)).xyz;
    vec4 ray_o = vec4(2.0 * vUv - 1.0, 1.0, 1.0);
    ray_o.xy *= orthoScale;
    ray_o.x *= iResolution.x / iResolution.y;
    eyeRay_o = (inverseModelViewMatrix * ray_o).xyz;
  }

  vec3 boxMin = AABB_CLIP_MIN;
  vec3 boxMax = AABB_CLIP_MAX;
  float tnear, tfar;
  bool hit = intersectBox(eyeRay_o, eyeRay_d, boxMin, boxMax, tnear, tfar);
  if (!hit) {
    outputColour = vec4(1.0, 0.0, 0.0, 0.0);
    return;
  }
  // else {
  // 		outputColour = vec4(0.0, 1.0, 0.0, 1.0);
  // 		return;
  // }
  float clipNear =
      0.0; //-(dot(eyeRay_o.xyz, eyeNorm) + dNear) / dot(eyeRay_d.xyz, eyeNorm);
  float clipFar = 10000.0; //-(dot(eyeRay_o.xyz,-eyeNorm) + dFar ) /
                           // dot(eyeRay_d.xyz,-eyeNorm);

  //vec3 pos = eyeRay_o + eyeRay_d * ((tnear + tfar)*0.5);
  //pos.xyz = (pos.xyz + 0.5); // 0.5 * (pos + 1.0); // map position from
                              // [boxMin, boxMax] to [0, 1] coordinates
  //outputColour = sampleStack(vec4(pos, 1.0));
  //return;



  vec4 C = integrateVolume(vec4(eyeRay_o, 1.0), vec4(eyeRay_d, 0.0), tnear,
                           tfar, clipNear, clipFar);
  C = clamp(C, 0.0, 1.0);
  outputColour = C;
  return;
}
