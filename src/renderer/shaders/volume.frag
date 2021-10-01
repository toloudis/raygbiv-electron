varying vec3 pObj;

uniform vec2 iResolution;
uniform vec2 textureRes;
uniform float GAMMA_MIN;
uniform float GAMMA_MAX;
uniform float GAMMA_SCALE;
uniform float BRIGHTNESS;
uniform float DENSITY;
uniform float maskAlpha;
uniform float ATLAS_X;
uniform float ATLAS_Y;
uniform vec3 AABB_CLIP_MIN;
uniform float CLIP_NEAR;
uniform vec3 AABB_CLIP_MAX;
uniform float CLIP_FAR;
uniform sampler2D textureAtlas;
uniform sampler2D textureAtlasMask;
uniform int BREAK_STEPS;
uniform float SLICES;
uniform float isOrtho;
uniform float orthoThickness;
uniform float orthoScale;
uniform int maxProject;
uniform vec3 flipVolume;
uniform vec3 volumeScale;
// view space to axis-aligned volume box
uniform mat4 inverseModelViewMatrix;

#define M_PI 3.14159265358979323846

float powf(float a, float b){
  return pow(a,b);
}

float rand(vec2 co){
  float threadId = gl_FragCoord.x/(gl_FragCoord.y + 1.0);
  float bigVal = threadId*1299721.0/911.0;
  vec2 smallVal = vec2(threadId*7927.0/577.0, threadId*104743.0/1039.0);
  return fract(sin(dot(co, smallVal)) * bigVal);
}

vec4 luma2Alpha(vec4 color, float vmin, float vmax, float C){
  float x = dot(color.rgb, vec3(0.2125, 0.7154, 0.0721));
  float xi = (x-vmin)/(vmax-vmin);
  xi = clamp(xi,0.0,1.0);
  float y = pow(xi,C);
  y = clamp(y,0.0,1.0);
  color[3] = y;
  return(color);
}

vec2 offsetFrontBack(float t, float nx, float ny){
  int a = int(t);
  int ax = int(ATLAS_X);
  vec2 os = vec2(float(a-(a/ax)*ax) / ATLAS_X, float(a/ax) / ATLAS_Y);
  return os;
}

vec4 sampleAs3DTexture(sampler2D tex, vec4 pos) {
  float bounds = float(pos[0] >= 0.0 && pos[0] <= 1.0 &&
                        pos[1] >= 0.0 && pos[1] <= 1.0 &&
                        pos[2] >= 0.0 && pos[2] <= 1.0 );

  vec4 texval =
      vec4(textureLod(sampler3D(textureAtlas, textureSampler), pos.xyz, 0).r);
  vec4 retval = vec4(texval.rgb, 1.0);
  vec4 maskval =
      vec4(textureLod(sampler3D(textureAtlasMask, textureSampler), pos.xyz, 0).r);
  maskVal = mix(maskVal, 1.0, maskAlpha);
// only mask the rgb, not the alpha(?)
  retval.rgb *= maskVal;
  return bounds*retval;
}

vec4 sampleStack(sampler2D tex, vec4 pos) {
  vec4 col = sampleAs3DTexture(tex, pos);
  col = luma2Alpha(col, GAMMA_MIN, GAMMA_MAX, GAMMA_SCALE);
  return col;
}

bool intersectBox(in vec3 r_o, in vec3 r_d, in vec3 boxMin, in vec3 boxMax,
                  out float tnear, out float tfar){
// compute intersection of ray with all six bbox planes
  vec3 invR = vec3(1.0,1.0,1.0) / r_d;
  vec3 tbot = invR * (boxMin - r_o);
  vec3 ttop = invR * (boxMax - r_o);
// re-order intersections to find smallest and largest on each axis
  vec3 tmin = min(ttop, tbot);
  vec3 tmax = max(ttop, tbot);
// find the largest tmin and the smallest tmax
  float largest_tmin  = max(max(tmin.x, tmin.y), max(tmin.x, tmin.z));
  float smallest_tmax = min(min(tmax.x, tmax.y), min(tmax.x, tmax.z));
  tnear = largest_tmin;
  tfar = smallest_tmax;
// use >= here?
  return(smallest_tmax > largest_tmin);
}
vec4 accumulate(vec4 col, float s, vec4 C) {
    float stepScale = (1.0 - powf((1.0-col.w),s));
    col.w = stepScale;
    col.xyz *= col.w;
    col = clamp(col,0.0,1.0);
    C = (1.0-C.w)*col + C;
    return C;
}
vec4 accumulateMax(vec4 col, float s, vec4 C) {
    if (col.x*col.w > C.x) { C.x = col.x*col.w; }
    if (col.y*col.w > C.y) { C.y = col.y*col.w; }
    if (col.z*col.w > C.z) { C.z = col.z*col.w; }
    if (col.w > C.w) { C.w = col.w; }
    return C;
}
vec4 integrateVolume(vec4 eye_o,vec4 eye_d,
                      float tnear,   float tfar,
                      float clipNear, float clipFar,
                      sampler2D textureAtlas
                      ){
  vec4 C = vec4(0.0);
  float tend   = tfar;
  float tbegin = tnear;
//'  // march along ray from front to back, accumulating color',
//'  //estimate step length',
  const int maxSteps = 512;
// modify the 3 components of eye_d by volume scale
  float scaledSteps = float(BREAK_STEPS) * length((eye_d.xyz/volumeScale));
  float csteps = clamp(float(scaledSteps), 1.0, float(maxSteps));
  float invstep = (tfar-tnear)/csteps;
// special-casing the single slice to remove the random ray dither.
// this removes a Moire pattern visible in single slice images, which we want to view as 2D images as best we can.
  float r = (SLICES==1.0) ?  0.0 : 0.5 - 1.0*rand(eye_d.xy);
// if ortho and clipped, make step size smaller so we still get same number of steps
  float tstep = invstep*orthoThickness;
  float tfarsurf = r*tstep;
  float overflow = mod((tfarsurf - tend),tstep);", // random dithering offs
  float t = tbegin + overflow;
  t += r*tstep; // random dithering offs
  float tdist = 0.0;
  int numSteps = 0;
vec4 pos, col;
// We need to be able to scale the alpha contrib with number of ray steps,
// in order to make the final color invariant to the step size(?)
// use maxSteps (a constant) as the numerator... Not sure if this is sound.
    float s = 0.5 * float(maxSteps) / csteps;
for(int i=0; i<maxSteps; i++){
  pos = eye_o + eye_d*t;
// !!! assume box bounds are -0.5 .. 0.5.  pos = (pos-min)/(max-min)
// scaling is handled by model transform and already accounted for before we get here.
// AABB clip is independent of this and is only used to determine tnear and tfar.
  pos.xyz = (pos.xyz-(-0.5))/((0.5)-(-0.5)); //0.5 * (pos + 1.0); // map position from [boxMin, boxMax] to [0, 1] coordinates
  col = sampleStack(textureAtlas,pos);
      col.xyz *= BRIGHTNESS;
    if (maxProject != 0) {
      C = accumulateMax(col, s, C);
    } else {
// for practical use the density only matters for regular volume integration
      col.w *= DENSITY;
      C = accumulate(col, s, C);
    }
    t += tstep;
    numSteps = i;
    if (t  > tend || t > tbegin+clipFar ) break;
    if (C.w > 1.0 ) break;
}
  return C;
}
void main()
{
  gl_FragColor = vec4(0.0);
  vec2 vUv = gl_FragCoord.xy/iResolution.xy;
  vec3 eyeRay_o, eyeRay_d;
  if (isOrtho == 0.0) {
// for perspective rays:
// world space camera coordinates
// transform to object space
    eyeRay_o = (inverseModelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    eyeRay_d = normalize(pObj - eyeRay_o);
  }
  else {
// for ortho rays:
    float zDist = 2.0;
    eyeRay_d = (inverseModelViewMatrix*vec4(0.0, 0.0, -zDist, 0.0)).xyz;
    vec4 ray_o = vec4(2.0*vUv - 1.0, 1.0, 1.0);
    ray_o.xy *= orthoScale;
    ray_o.x *= iResolution.x/iResolution.y;
    eyeRay_o   = (inverseModelViewMatrix*ray_o).xyz;
  }
// -0.5..0.5 is full box. AABB_CLIP lets us clip to a box shaped ROI to look at
// I am applying it here at the earliest point so that the ray march does
// not waste steps.  For general shaped ROI, this has to be handled more
// generally (obviously)
  vec3 boxMin = AABB_CLIP_MIN;
  vec3 boxMax = AABB_CLIP_MAX;
  float tnear, tfar;
  bool hit = intersectBox(eyeRay_o, eyeRay_d, boxMin, boxMax, tnear, tfar);
  if (!hit) {
// return background color if ray misses the cube
// is this safe to do when there is other geometry / gObjects drawn?
      gl_FragColor = vec4(0.0);", //C1;//vec4(0.0);
      return;
  }
  float clipNear = 0.0;//-(dot(eyeRay_o.xyz, eyeNorm) + dNear) / dot(eyeRay_d.xyz, eyeNorm);
  float clipFar  = 10000.0;//-(dot(eyeRay_o.xyz,-eyeNorm) + dFar ) / dot(eyeRay_d.xyz,-eyeNorm);
  vec4 C = integrateVolume(vec4(eyeRay_o,1.0), vec4(eyeRay_d,0.0),
                            tnear,    tfar,", //intersections of b
                            clipNear, clipFar,
                            textureAtlas);//,nBlocks);
  C = clamp(C, 0.0, 1.0);
  gl_FragColor = C;
  return;
}
