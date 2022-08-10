struct VertexInput {
  @location(0) position: vec3<f32>
};
struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) pObj: vec3<f32>
};

struct Uniforms {
  modelViewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>
};

struct FragUBO {
  inverseModelViewMatrix: mat4x4<f32>,
  iResolution: vec2<f32>,
  isPerspective: f32,
  orthoScale: f32,
  GAMMA_MIN: f32,
  GAMMA_MAX: f32,
  GAMMA_SCALE: f32,
  BRIGHTNESS: f32,
  AABB_CLIP_MIN: vec3<f32>,
  dataRangeMin: f32, // 0..1 (mapped from 0..uint16_max)
  AABB_CLIP_MAX: vec3<f32>,
  dataRangeMax: f32, // 0..1 (mapped from 0..uint16_max)
  maskAlpha: f32,
  DENSITY: f32,
  BREAK_STEPS: i32,
  SLICES: f32,
  volumeScale: vec3<f32>,
  orthoThickness: f32,
  maxProject: i32,
  ATLAS_X: i32,
  ATLAS_Y: i32,
  padding: i32
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var textureAtlas: texture_3d<f32>;
@group(0) @binding(3) var<uniform> fraguniforms: FragUBO;



@vertex
fn main_vs(
    in: VertexInput
) -> VertexOutput {
    var out:VertexOutput;
    out.pObj = in.position;
    out.clip_position = uniforms.projectionMatrix * uniforms.modelViewMatrix * vec4<f32>(in.position, 1.0);
    return out;
}

const M_PI = 3.14159265358979323846;

fn powf(a: f32, b: f32) -> f32 { return pow(a, b); }

fn rand(co: vec2<f32>, fragcoord: vec4<f32>) -> f32 {
    let threadId = fragcoord.x / (fragcoord.y + 1.0);
    let bigVal = threadId * 1299721.0 / 911.0;
    let smallVal = vec2<f32>(threadId * 7927.0 / 577.0, threadId * 104743.0 / 1039.0);
    return fract(sin(dot(co, smallVal)) * bigVal);
}

fn luma2Alpha(color: ptr<function, vec4<f32>>, vmin: f32, vmax: f32, C: f32) -> vec4<f32> {
    let x = dot((*color).rgb, vec3<f32>(0.2125, 0.7154, 0.0721));
  //let x = max((*color)[2], max((*color)[0], (*color)[1]));
    var xi = (x - vmin) / (vmax - vmin);
    xi = clamp(xi, 0.0, 1.0);
    var y = pow(xi, C);
    y = clamp(y, 0.0, 1.0);
    (*color)[3] = y;
    return (*color);
}

fn sampleAs3DTexture(pos: vec4<f32>) -> vec4<f32> {
    var bounds = 0.0;
    if ((pos.x >= 0.0) && (pos.x <= 1.0) && (pos.y >= 0.0) && (pos.y <= 1.0) && (pos.z >= 0.0) && (pos.z <= 1.0)) {
        bounds = 1.0;
    }

    let texval:vec4<f32> = textureSampleLevel(textureAtlas, textureSampler, pos.xyz, 0.0);
    let retval = vec4<f32>(texval.rgb, 1.0);
//   vec4 maskval =
//       vec4(textureLod(sampler3D(textureAtlasMask, textureSampler), pos.xyz, 0).r);
//   maskVal = mix(maskVal, 1.0, maskAlpha);
// // only mask the rgb, not the alpha(?)
//   retval.rgb *= maskVal;

    return bounds * retval;
}

fn sampleStack(pos: vec4<f32>) -> vec4<f32> {
    var col = sampleAs3DTexture(pos);
    col = luma2Alpha(&col, fraguniforms.GAMMA_MIN, fraguniforms.GAMMA_MAX, fraguniforms.GAMMA_SCALE);
    return col;
}

//->intersect AXIS-ALIGNED box routine
//
fn intersectBox(r_o: vec3<f32>, r_d: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>, tnear: ptr<function, f32>, tfar: ptr<function, f32>) -> bool {
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

fn accumulate(col: vec4<f32>, s: f32, C: vec4<f32>) -> vec4<f32> {
    let stepScale = (1.0 - powf((1.0 - col.w), s));

    var scol: vec4<f32> = vec4<f32>(col.xyz * stepScale, stepScale);
    scol = clamp(scol, vec4<f32>(0.0), vec4<f32>(1.0));
    return (1.0 - C.w) * scol + C;
}

fn accumulateMax(col: vec4<f32>, s: f32, C: vec4<f32>) -> vec4<f32> {
    var retval: vec4<f32> = C;
    if (col.x * col.w > C.x) { retval.x = col.x * col.w; }
    if (col.y * col.w > C.y) { retval.y = col.y * col.w; }
    if (col.z * col.w > C.z) { retval.z = col.z * col.w; }
    if (col.w > C.w) { retval.w = col.w; }
    return retval;
}

fn integrateVolume(eye_o: vec4<f32>, eye_d: vec4< f32>, tnear: f32, tfar: f32, clipNear: f32, clipFar: f32, fragcoord: vec4<f32>) -> vec4<f32> {
    var C = vec4<f32>(0.0); // background color????
    let tend = tfar;
    let tbegin = tnear;
    let maxSteps = 128;//512?
    let scaledSteps = f32(fraguniforms.BREAK_STEPS) * length((eye_d.xyz / fraguniforms.volumeScale));
    let csteps = clamp(f32(scaledSteps), 1.0, f32(maxSteps));
    let invstep = (tfar - tnear) / csteps;

    var r = 0.0;
    if (fraguniforms.SLICES != 1.0) {
        r = 0.5 - 1.0 * rand(eye_d.xy, fragcoord);
    }

    let tstep:f32 = invstep * fraguniforms.orthoThickness;
    let tfarsurf = r * tstep;
  // mod(tfarsurf-tend, tstep)
    let overflow = tfarsurf - tend - tstep * floor((tfarsurf - tend) / tstep);
    var t = tbegin + overflow;
    t = t + r * tstep;
    var tdist = 0.0;
    var numSteps = 0;

    var pos:vec4<f32>;
    var col:vec4<f32>;
    let s = 0.5 * f32(maxSteps) / csteps;
    for (var i = 0; i < maxSteps; i = i + 1) {
        pos = eye_o + eye_d * t;
        pos = vec4<f32>((pos.xyz + 0.5), pos.w); // 0.5 * (pos + 1.0); // map position from
                               // [boxMin, boxMax] to [0, 1] coordinates
        col = sampleStack(pos);

        col = vec4<f32>(col.xyz * fraguniforms.BRIGHTNESS, col.w);
        if (fraguniforms.maxProject != 0) {
            C = accumulateMax(col, s, C);
        } else {
            col.w = col.w * fraguniforms.DENSITY;
            C = accumulate(col, s, C);
        }
        t = t + tstep;
        numSteps = i;
        if (t > tend || t > tbegin + clipFar) {
      break;
        }
        if (C.w > 1.0) {
      break;
        }
    }
    return C;
}

@fragment
fn main_fs(
    in: VertexOutput
) -> @location(0) vec4<f32> {
    var outputColour = vec4<f32>(0.0, 0.0, 0.0, 0.0);

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
        outputColour = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        return outputColour;
    }
  //else {
  //	outputColour = vec4<f32>(0.0, 1.0, 0.0, 1.0);
  //	return outputColour;
  //}
    let clipNear = 0.0; //-(dot(eyeRay_o.xyz, eyeNorm) + dNear) / dot(eyeRay_d.xyz, eyeNorm);
    let clipFar = 10000.0; //-(dot(eyeRay_o.xyz,-eyeNorm) + dFar ) /
                           // dot(eyeRay_d.xyz,-eyeNorm);

  //vec3 pos = eyeRay_o + eyeRay_d * ((tnear + tfar)*0.5);
  //pos.xyz = (pos.xyz + 0.5); // 0.5 * (pos + 1.0); // map position from
                              // [boxMin, boxMax] to [0, 1] coordinates
  //outputColour = sampleStack(vec4(pos, 1.0));
  //return;

    var C = integrateVolume(vec4<f32>(eyeRay_o, 1.0), vec4<f32>(eyeRay_d, 0.0), tnear, tfar, clipNear, clipFar, in.clip_position);
    C = clamp(C, vec4<f32>(0.0), vec4<f32>(1.0));
    outputColour = C;
    return outputColour;
}
