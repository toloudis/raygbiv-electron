struct VertexOutput {
  [[builtin(position)]] clip_position: vec4<f32>;
  [[location(0)]] pObj: vec3<f32>;
};

[[block]]
struct Uniforms {
  modelViewMatrix: mat4x4<f32>;
  projectionMatrix: mat4x4<f32>;
};

[[group(0), binding(0)]]
var<uniform> uniforms: Uniforms;


[[stage(vertex)]]
fn main_vs(
  [[location(0)]] position: vec3<f32>
) -> VertexOutput {
  var out:VertexOutput;
  out.pObj = position;
  out.clip_position = uniforms.projectionMatrix * uniforms.modelViewMatrix * vec4<f32>(position, 1.0);
  return out;
}

[[block]] struct FragUBO {
  inverseModelViewMatrix: mat4x4<f32>;
  iResolution: vec2<f32>;
  isPerspective: f32;
  orthoScale: f32;
  GAMMA_MIN: f32;
  GAMMA_MAX: f32;
  GAMMA_SCALE: f32;
  BRIGHTNESS: f32;
  AABB_CLIP_MIN: vec3<f32>;
  dataRangeMin: f32; // 0..1 (mapped from 0..uint16_max)
  AABB_CLIP_MAX: vec3<f32>;
  dataRangeMax: f32; // 0..1 (mapped from 0..uint16_max)
  maskAlpha: f32;
  DENSITY: f32;
  BREAK_STEPS: i32;
};

[[group(0), binding(1)]] var textureSampler: sampler;
[[group(0), binding(2)]] var textureAtlas: texture_3d<f32>;
[[group(0), binding(3)]] var<uniform> fraguniforms: FragUBO;

let M_PI = 3.14159265358979323846;

fn powf( a: f32, b: f32) -> f32 { return pow(a, b); }

fn rand(co : vec2<f32>, fragcoord: vec4<f32>) -> f32 {
  let threadId = fragcoord.x / (fragcoord.y + 1.0);
  let bigVal = threadId * 1299721.0 / 911.0;
  let smallVal = vec2<f32>(threadId * 7927.0 / 577.0, threadId * 104743.0 / 1039.0);
  return fract(sin(dot(co, smallVal)) * bigVal);
}

fn luma2Alpha( color: ptr<function, vec4<f32>>,  vmin:f32,  vmax:f32,  C:f32) -> vec4<f32> {
  let x = max((*color)[2], max((*color)[0], (*color)[1]));
  var xi = (x - vmin) / (vmax - vmin);
  xi = clamp(xi, 0.0, 1.0);
  var y = pow(xi, C);
  y = clamp(y, 0.0, 1.0);
  (*color)[3] = y;
  return (*color);
}

fn sampleAs3DTexture( pos: vec4<f32>) -> vec4<f32> {
  let bounds = f32(pos[0] > 0.001 && pos[0] < 0.999 && pos[1] > 0.001 &&
                       pos[1] < 0.999 && pos[2] > 0.001 && pos[2] < 0.999);

  let texval:vec4<f32> =
      vec4<f32>(textureSampleLevel(textureAtlas, textureSampler, pos.xyz, 0.0).r);
  let retval = vec4<f32>(texval.rgb, 1.0);

  //    float texval = textureLod(tex, pos.xyz, 0).r;
  //	texval = (texval - dataRangeMin) / (dataRangeMax - dataRangeMin);
  //	vec4 retval = vec4(texval, texval, texval, 1.0);
  return bounds * retval;
}

fn sampleStack( pos: vec4<f32>) -> vec4<f32> {
  var col = sampleAs3DTexture(pos);
  col = luma2Alpha(&col, fraguniforms.GAMMA_MIN, fraguniforms.GAMMA_MAX, fraguniforms.GAMMA_SCALE);
  return col;
}

//->intersect AXIS-ALIGNED box routine
//
fn intersectBox( r_o: vec3<f32>, r_d: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>,
                  tnear: ptr<function, f32>, tfar: ptr<function, f32>) -> bool {
  let invR = vec3<f32>(1.0, 1.0, 1.0) / r_d;
  let tbot = invR * (boxMin - r_o);
  let ttop = invR * (boxMax - r_o);
  let tmin = min(ttop, tbot);
  let tmax = max(ttop, tbot);
  let largest_tmin = max(max(tmin.x, tmin.y), max(tmin.x, tmin.z));
  let smallest_tmax = min(min(tmax.x, tmax.y), min(tmax.x, tmax.z));
  *tnear = largest_tmin;
  *tfar = smallest_tmax;
  return (smallest_tmax > largest_tmin);
}

fn integrateVolume( eye_o: vec4<f32>, eye_d: vec4<f32>, tnear:f32, tfar:f32,
                      clipNear:f32,  clipFar:f32, fragcoord: vec4<f32>) -> vec4<f32> {
  var C = vec4<f32>(0.0);
  let tend = min(tfar, clipFar);
  let tbegin = tnear;
  let maxSteps = 512;
  let csteps = clamp(f32(fraguniforms.BREAK_STEPS), 1.0, f32(maxSteps));
  let invstep = 1.0 / csteps;
  let r = 0.5 - 1.0 * rand(eye_d.xy, fragcoord);
  let tstep:f32 = invstep;
  let tfarsurf = r * tstep;
  // mod(tfarsurf-tend, tstep)
  let overflow = tfarsurf-tend - tstep*floor((tfarsurf - tend)/tstep);
  var t = tbegin + overflow;
  t = t + r * tstep;
  var tdist = 0.0;
  var numSteps = 0;

  var pos:vec4<f32>;
  var col:vec4<f32>;
  let s = 0.5 * f32(maxSteps) / csteps;
  for (var i = 0; i < maxSteps; i=i+1) {
    pos = eye_o + eye_d * t;
    pos = vec4<f32>((pos.xyz + 0.5), pos.w); // 0.5 * (pos + 1.0); // map position from
                               // [boxMin, boxMax] to [0, 1] coordinates
    col = sampleStack(pos);

    // Finish up by adding brightness/density
    col = vec4<f32>(col.xyz * fraguniforms.BRIGHTNESS, col.w * fraguniforms.DENSITY);
    let stepScale = (1.0 - powf((1.0 - col.w), s));
    col = vec4<f32>(col.xyz*col.w, stepScale);
    col = clamp(col, vec4<f32>(0.0), vec4<f32>(1.0));

    C = (1.0 - C.w) * col + C;
    t = t + tstep;
    numSteps = i;
    if (t > tend){
      break;
    }
    if (C.w > 1.0)
    {
      break;
    }
  }
  return C;
}

[[stage(fragment)]]
fn main_fs(
  in: VertexOutput
) -> [[location(0)]] vec4<f32> {
  var outputColour = vec4<f32>(1.0, 0.0, 0.0, 1.0);

  let vUv = in.clip_position.xy;// / fraguniforms.iResolution.xy;

  var eyeRay_o: vec3<f32>;
  var eyeRay_d: vec3<f32>;
  if (fraguniforms.isPerspective != 0.0) {
    // put ray in object space (which is the 0-1 range of the cube coordinates)
    // transform view space 0,0,0 (the eye position) into model (object) space
    eyeRay_o = (fraguniforms.inverseModelViewMatrix * vec4<f32>(0.0, 0.0, 0.0, 1.0)).xyz;
    // pObj is already in object space
    eyeRay_d = normalize(in.pObj - eyeRay_o);
  } else {
    let zDist = 2.0;
    eyeRay_d = (fraguniforms.inverseModelViewMatrix * vec4<f32>(0.0, 0.0, -zDist, 0.0)).xyz;
    var ray_o = vec4<f32>(2.0 * vUv - 1.0, 1.0, 1.0);
    ray_o = vec4<f32>(
      ray_o.x * fraguniforms.orthoScale * fraguniforms.iResolution.x / fraguniforms.iResolution.y,
      ray_o.y * fraguniforms.orthoScale,
      ray_o.z,
      ray_o.w
    );
    eyeRay_o = (fraguniforms.inverseModelViewMatrix * ray_o).xyz;
  }

  let boxMin = fraguniforms.AABB_CLIP_MIN;
  let boxMax = fraguniforms.AABB_CLIP_MAX;
  var tnear:f32;
  var tfar:f32;
  let hit:bool = intersectBox(eyeRay_o, eyeRay_d, boxMin, boxMax, &tnear, &tfar);
  if (!hit) {
    outputColour = vec4<f32>(1.0, 0.0, 1.0, 1.0);
    return outputColour;
  }
  // else {
  // 		outputColour = vec4(0.0, 1.0, 0.0, 1.0);
  // 		return;
  // }
  let clipNear =
      0.0; //-(dot(eyeRay_o.xyz, eyeNorm) + dNear) / dot(eyeRay_d.xyz, eyeNorm);
  let clipFar = 10000.0; //-(dot(eyeRay_o.xyz,-eyeNorm) + dFar ) /
                           // dot(eyeRay_d.xyz,-eyeNorm);

  //vec3 pos = eyeRay_o + eyeRay_d * ((tnear + tfar)*0.5);
  //pos.xyz = (pos.xyz + 0.5); // 0.5 * (pos + 1.0); // map position from
                              // [boxMin, boxMax] to [0, 1] coordinates
  //outputColour = sampleStack(vec4(pos, 1.0));
  //return;



  var C = integrateVolume(vec4<f32>(eyeRay_o, 1.0), vec4<f32>(eyeRay_d, 0.0), tnear,
                           tfar, clipNear, clipFar, in.clip_position);
  C = clamp(C, vec4<f32>(0.0), vec4<f32>(1.0));
  outputColour = C;
  return outputColour;
}


