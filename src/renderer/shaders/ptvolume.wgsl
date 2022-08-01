struct VertexInput {
    @location(0) position: vec2<f32>
};

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) vUv: vec2<f32>
};

@vertex
fn main_vs(
    in: VertexInput,
) -> VertexOutput {
    var out:VertexOutput;
    out.vUv = vec2<f32>(in.position.x, 1.0 - in.position.y);
    out.clip_position = vec4<f32>(in.position * vec2<f32>(2.0) - vec2<f32>(1.0), 0.0, 1.0);
    return out;
}

let PI:f32 = 3.1415926535897932384626433832795;
let PI_OVER_2:f32 = 1.57079632679489661923;
let PI_OVER_4:f32 = 0.785398163397448309616;
//let INV_PI = 1.0 / PI;
//let INV_2_PI = 0.5 / PI;
//let INV_4_PI = 0.25 / PI;

let BLACK = vec3<f32>(0.0, 0.0, 0.0);
let WHITE = vec3<f32>(1.0, 1.0, 1.0);
let ShaderType_Brdf:i32 = 0;
let ShaderType_Phase:i32 = 1;

struct Camera {
   m_from: vec3<f32>,
   // pad 1
   m_U: vec3<f32>,
   // pad 1
   m_V: vec3<f32>,
   // pad 1
   m_N: vec3<f32>,
   // pad 1
   m_screen: vec4<f32>,  // left, right, bottom, top
   m_invScreen: vec2<f32>,  // 1/w, 1/h
  m_focalDistance: f32,
  m_apertureSize: f32,
  m_isPerspective: f32,
  // pad 3
};

struct Light {
  m_theta: f32,
  m_phi: f32,
  m_width: f32,
  m_halfWidth: f32,
  m_height: f32,
  m_halfHeight: f32,
  m_distance: f32,
  m_skyRadius: f32,
  m_area: f32,
  m_areaPdf: f32,
  m_T: i32,
  //pad: f32;
  m_P: vec3<f32>,
  //pad0: f32;
  m_target: vec3<f32>,
  //pad1: f32;
  m_N: vec3<f32>,
  //pad2: f32;
  m_U: vec3<f32>,
  //pad3: f32;
  m_V: vec3<f32>,
  //pad4: f32;

  m_color: vec3<f32>,
  //pad5: f32;
  m_colorTop: vec3<f32>,
  //pad6: f32;
  m_colorMiddle: vec3<f32>,
  //pad7: f32;
  m_colorBottom: vec3<f32>,
  //pad8: f32;
};
let NUM_LIGHTS:i32 = 2;
struct Lights {
  lights: array<Light,NUM_LIGHTS>
};

struct GlobalParams {
    gClippedAaBbMin: vec3<f32>,
    // pad 1
    gClippedAaBbMax: vec3<f32>,
     gDensityScale: f32,
     gStepSize: f32,
     gStepSizeShadow: f32,
     // pad 2
     gInvAaBbSize: vec3<f32>,
     g_nChannels: i32,

     gShadingType: i32,
     // pad 3
     gGradientDeltaX: vec3<f32>,
     // pad 1
     gGradientDeltaY: vec3<f32>,
     // pad 1
     gGradientDeltaZ: vec3<f32>,
     gInvGradientDelta: f32,
     gGradientFactor: f32,
     uShowLights: f32,
     // pad 2
};

// per channel
// SOA or AOS?
struct Channels {
     g_intensityMax: vec4<f32>,
     g_intensityMin: vec4<f32>,
     g_opacity: array<f32, 4>,
     g_emissive: array<vec4<f32>, 4>,
     g_diffuse: array<vec4<f32>, 4>,
     g_specular: array<vec4<f32>, 4>,
     g_roughness: array<f32, 4>,
};

// compositing / progressive render
struct Progressive {
    uFrameCounter: f32,
    uSampleCounter: f32,
    uResolution: vec2<f32>,
};

// updates on camera moves
@group(0) @binding(0)
var<uniform> gCamera: Camera;
// update when lighting settings change
@group(0) @binding(1)
var<uniform> gLights: Lights;
// update when render params change
@group(0) @binding(2)
var<uniform> gParams: GlobalParams;
// update when channel settings change
@group(0) @binding(3)
var<uniform> gChannels: Channels;
// updates per frame when cam not moving
@group(0) @binding(4)
var<uniform> gComposite: Progressive;

// THE VOLUME DATA
@group(0) @binding(5) var volumeTextureSampler: sampler;
@group(0) @binding(6) var volumeTexture: texture_3d<f32>;
// THE CHANNEL LUTS (4 rows in the texture)
@group(0) @binding(7) var lutSampler: sampler;
@group(0) @binding(8) var g_lutTexture: texture_2d<f32>;
// for composite/progressive render
@group(0) @binding(9) var tPreviousTexture: texture_2d<f32>;


// from iq https://www.shadertoy.com/view/4tXyWN
var<private> seed:vec2<u32>;
fn rand() -> f32 {
    seed = seed + vec2<u32>(1u, 1u);
    let q:vec2<u32> = 1103515245u * ( ((seed) >> vec2<u32>(1u, 1u)) ^ ((seed).yx) );
    let n:u32 = 1103515245u * ( (q.x) ^ (q.y >> 3u) );
    return f32(n) * (1.0 / f32(0xffffffffu));
}

fn XYZtoRGB(xyz: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        3.240479 * xyz[0] - 1.537150 * xyz[1] - 0.498535 * xyz[2],
        -0.969256 * xyz[0] + 1.875991 * xyz[1] + 0.041556 * xyz[2],
        0.055648 * xyz[0] - 0.204043 * xyz[1] + 1.057311 * xyz[2]
    );
}

fn RGBtoXYZ(rgb: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        0.412453 * rgb[0] + 0.357580 * rgb[1] + 0.180423 * rgb[2],
        0.212671 * rgb[0] + 0.715160 * rgb[1] + 0.072169 * rgb[2],
        0.019334 * rgb[0] + 0.119193 * rgb[1] + 0.950227 * rgb[2]
    );
}

fn getUniformSphereSample(U: vec2<f32>) -> vec3<f32> {
    let z:f32 = 1.0 - 2.0 * U.x;
    let r:f32 = sqrt(max(0.0, 1.0 - z * z));
    let phi:f32 = 2.0 * PI * U.y;
    let x:f32 = r * cos(phi);
    let y:f32 = r * sin(phi);
    return vec3<f32>(x, y, z);
}

fn SphericalPhi(Wl: vec3<f32>) -> f32 {
    let p:f32 = atan2(Wl.z, Wl.x);
    return select(p, p + 2.0 * PI, (p < 0.0));
}

fn SphericalTheta(Wl: vec3<f32>) -> f32 {
    return acos(clamp(Wl.y, -1.0, 1.0));
}

fn SameHemisphere(Ww1: vec3<f32>, Ww2: vec3<f32>) -> bool {
    return (Ww1.z * Ww2.z) > 0.0;
}

fn getConcentricDiskSample(U: vec2<f32>) -> vec2<f32> {
    var r:f32;
    var theta:f32;
  // Map uniform random numbers to [-1,1]^2
    let sx = 2.0 * U.x - 1.0;
    let sy = 2.0 * U.y - 1.0;
  // Map square to (r,theta)
  // Handle degeneracy at the origin

    if (sx == 0.0 && sy == 0.0) {
        return vec2<f32>(0.0, 0.0);
    }

    if (sx >= -sy) {
        if (sx > sy) {
      // Handle first region of disk
            r = sx;
            if (sy > 0.0) {
                theta = sy / r;
            } else {
                theta = 8.0 + sy / r;
            }
        } else {
      // Handle second region of disk
            r = sy;
            theta = 2.0 - sx / r;
        }
    } else {
        if (sx <= sy) {
      // Handle third region of disk
            r = -sx;
            theta = 4.0 - sy / r;
        } else {
      // Handle fourth region of disk
            r = -sy;
            theta = 6.0 + sx / r;
        }
    }

    theta = theta * PI_OVER_4;

    return vec2<f32>(r * cos(theta), r * sin(theta));
}

fn getCosineWeightedHemisphereSample(U: vec2<f32>) -> vec3<f32> {
    let ret = getConcentricDiskSample(U);
    return vec3<f32>(ret.x, ret.y, sqrt(max(0.0, 1.0 - ret.x * ret.x - ret.y * ret.y)));
}

struct Ray {
  m_O: vec3<f32>,
  m_D: vec3<f32>,
  m_MinT: f32,
  m_MaxT: f32,
};

fn newRay(o: vec3<f32>, d: vec3<f32>) -> Ray {
    return Ray(o, d, 0.0, 1500000.0);
}

fn newRayT(o: vec3<f32>, d: vec3<f32>, t0: f32, t1: f32) -> Ray {
    return Ray(o, d, t0, t1);
}

fn rayAt(r: Ray, t: f32) -> vec3<f32> {
    return r.m_O + t * r.m_D;
}

fn GenerateCameraRay(cam: Camera, Pixel: vec2<f32>, ApertureRnd: vec2<f32>) -> Ray {
    let ScreenPoint:vec2<f32> = vec2<f32>(
        cam.m_screen.x + (cam.m_invScreen.x * Pixel.x),
        cam.m_screen.z + (cam.m_invScreen.y * Pixel.y)
    );


    var RayO = cam.m_from;
    if (cam.m_isPerspective == 0.0) {
        RayO = RayO + (ScreenPoint.x * cam.m_U) + (ScreenPoint.y * cam.m_V);
    }
  // negating ScreenPoint.y flips the up/down direction. depends on whether you want pixel 0 at top or bottom
  // we could also have flipped m_screen and m_invScreen, or cam.m_V?
    var RayD:vec3<f32> = normalize(cam.m_N + (ScreenPoint.x * cam.m_U) + (ScreenPoint.y * cam.m_V));
    if (cam.m_isPerspective == 0.0) {
        RayD = cam.m_N;
    }

    if (cam.m_apertureSize != 0.0) {
        let LensUV:vec2<f32> = cam.m_apertureSize * getConcentricDiskSample(ApertureRnd);

        let LI:vec3<f32> = cam.m_U * LensUV.x + cam.m_V * LensUV.y;
        RayO = RayO + LI;
        RayD = normalize((RayD * cam.m_focalDistance) - LI);
    }

    return newRay(RayO, RayD);
}

fn IntersectBox(R: Ray, pNearT: ptr<function, f32>, pFarT: ptr<function, f32>) -> bool {
    let invR:vec3<f32> = vec3<f32>(1.0, 1.0, 1.0) / R.m_D;
    let bottomT:vec3<f32> = invR * (gParams.gClippedAaBbMin - R.m_O);
    let topT:vec3<f32> = invR * (gParams.gClippedAaBbMax - R.m_O);
    let minT:vec3<f32> = min(topT, bottomT);
    let maxT:vec3<f32> = max(topT, bottomT);
    let largestMinT = max(max(minT.x, minT.y), max(minT.x, minT.z));
    let smallestMaxT = min(min(maxT.x, maxT.y), min(maxT.x, maxT.z));

    *pNearT = largestMinT;
    *pFarT = smallestMaxT;

    return smallestMaxT > largestMinT;
}

fn PtoVolumeTex(p: vec3<f32>) -> vec3<f32> {
  // assume volume is centered at 0,0,0 so p spans -bounds to + bounds
  // transform p to range from 0,0,0 to 1,1,1 for volume texture sampling.
    return p * gParams.gInvAaBbSize + vec3<f32>(0.5, 0.5, 0.5);


  // center of volume is 0.5*extents
  // this needs to return a number in 0..1 range, so just rescale to bounds.
  // return p * gParams.gInvAaBbSize;
}

let UINT16_MAX:f32 = 1.0;//65535.0;
fn GetNormalizedIntensityMax4ch(P: vec3<f32>, ch: ptr<function, i32>) -> f32 {
    var intensity:vec4<f32> = UINT16_MAX * textureSampleLevel(volumeTexture, volumeTextureSampler, PtoVolumeTex(P), 0.0);

    var maxIn = 0.0;
    *ch = 0;

  //let a = intensity.x;

    intensity = (intensity - gChannels.g_intensityMin) / (gChannels.g_intensityMax - gChannels.g_intensityMin);
    intensity.x = textureSampleLevel(g_lutTexture, lutSampler, vec2<f32>(intensity.x, 0.125), 0.0).w;
    intensity.y = textureSampleLevel(g_lutTexture, lutSampler, vec2<f32>(intensity.y, 0.375), 0.0).w;
    intensity.z = textureSampleLevel(g_lutTexture, lutSampler, vec2<f32>(intensity.z, 0.625), 0.0).w;
    intensity.w = textureSampleLevel(g_lutTexture, lutSampler, vec2<f32>(intensity.w, 0.875), 0.0).w;

    for (var i = 0; i < min(gParams.g_nChannels, 4); i = i + 1) {
        if (intensity[i] > maxIn) {
            maxIn = intensity[i];
            *ch = i;
        }
    }
  //return a;
    return maxIn; // *factor;
}

fn GetNormalizedIntensity(P: vec3<f32>, ch: i32) -> f32 {
    var intensity = UINT16_MAX * textureSampleLevel(volumeTexture, volumeTextureSampler, PtoVolumeTex(P), 0.0)[ch];
    intensity = (intensity - gChannels.g_intensityMin[ch]) / (gChannels.g_intensityMax[ch] - gChannels.g_intensityMin[ch]);
    intensity = textureSampleLevel(g_lutTexture, lutSampler, vec2<f32>(intensity, f32(ch) + 0.5), 0.0).w;
    return intensity;
}

fn GetNormalizedIntensity4ch(P: vec3<f32>, ch: i32) -> f32 {
    let intensity = UINT16_MAX * textureSampleLevel(volumeTexture, volumeTextureSampler, PtoVolumeTex(P), 0.0);
  // select channel
    var intensityf:f32 = intensity[ch];
    intensityf = (intensityf - gChannels.g_intensityMin[ch]) / (gChannels.g_intensityMax[ch] - gChannels.g_intensityMin[ch]);
  //intensityf = texture(g_lutTexture[ch], vec2<f32>(intensityf, 0.5)).w;

    return intensityf;
}

// note that gInvGradientDelta is maxpixeldim of volume
// gGradientDeltaX,Y,Z is 1/X,Y,Z of volume
fn Gradient4ch(P: vec3<f32>, ch: i32) -> vec3<f32> {
    let Gradient = vec3<f32>(
        (GetNormalizedIntensity4ch(P + (gParams.gGradientDeltaX), ch) - GetNormalizedIntensity4ch(P - (gParams.gGradientDeltaX), ch)) * gParams.gInvGradientDelta,
        (GetNormalizedIntensity4ch(P + (gParams.gGradientDeltaY), ch) - GetNormalizedIntensity4ch(P - (gParams.gGradientDeltaY), ch)) * gParams.gInvGradientDelta,
        (GetNormalizedIntensity4ch(P + (gParams.gGradientDeltaZ), ch) - GetNormalizedIntensity4ch(P - (gParams.gGradientDeltaZ), ch)) * gParams.gInvGradientDelta
    );
    return Gradient;
}


fn GetOpacity(NormalizedIntensity: f32, ch: i32) -> f32 {
  // apply lut
    let Intensity = NormalizedIntensity * gChannels.g_opacity[ch];
    return Intensity;
}

fn GetEmissionN(NormalizedIntensity: f32, ch: i32) -> vec3<f32> {
    return gChannels.g_emissive[ch].rgb;
}

fn GetDiffuseN(NormalizedIntensity: f32, ch: i32) -> vec3<f32> {
    return gChannels.g_diffuse[ch].rgb;
}

fn GetSpecularN(NormalizedIntensity: f32, ch: i32) -> vec3<f32> {
    return gChannels.g_specular[ch].rgb;
}

fn GetRoughnessN(NormalizedIntensity: f32, ch: i32) -> f32 {
    return gChannels.g_roughness[ch];
}

// a bsdf sample, a sample on a light source, and a randomly chosen light index
struct CLightingSample {
  m_bsdfComponent: f32,
  m_bsdfDir: vec2<f32> ,
  m_lightPos: vec2<f32>,
  m_lightComponent: f32,
  m_LightNum: f32,
};

fn LightingSample_LargeStep() -> CLightingSample {
    return CLightingSample(
        rand(),
        vec2<f32>(rand(), rand()),
        vec2<f32>(rand(), rand()),
        rand(),
        rand()
    );
}

// return a color xyz
fn Light_Le(light: Light, UV: vec2<f32>) -> vec3<f32> {
    if (light.m_T == 0) {
        return RGBtoXYZ(light.m_color) / light.m_area;
    }

    if (light.m_T == 1) {
        if (UV.y > 0.0) {
            return RGBtoXYZ(mix(light.m_colorMiddle, light.m_colorTop, abs(UV.y)));
        } else {
            return RGBtoXYZ(mix(light.m_colorMiddle, light.m_colorBottom, abs(UV.y)));
        }
    }

    return BLACK;
}

// return a color xyz
fn Light_SampleL(light: Light, P: vec3<f32>, Rl: ptr<function, Ray>, Pdf: ptr<function, f32>, LS: CLightingSample) -> vec3<f32> {
    var L : vec3<f32> = BLACK;
    *Pdf = 0.0;
    var Ro = vec3<f32>(0.0, 0.0, 0.0);
    var Rd = vec3<f32>(0.0, 0.0, 1.0);
    if (light.m_T == 0) {
        Ro = (light.m_P + ((-0.5 + LS.m_lightPos.x) * light.m_width * light.m_U) + ((-0.5 + LS.m_lightPos.y) * light.m_height * light.m_V));
        Rd = normalize(P - Ro);
        L = select(BLACK, Light_Le(light, vec2<f32>(0.0)), dot(Rd, light.m_N) > 0.0);
        *Pdf = select(0.0, dot(P - Ro, P - Ro) / (abs(dot(Rd, light.m_N)) * light.m_area), abs(dot(Rd, light.m_N)) > 0.0);
    } else if (light.m_T == 1) {
        Ro = light.m_P + light.m_skyRadius * getUniformSphereSample(LS.m_lightPos);
        Rd = normalize(P - Ro);
        L = Light_Le(light, vec2<f32>(1.0) - 2.0 * LS.m_lightPos);
        *Pdf = pow(light.m_skyRadius, 2.0) / light.m_area;
    }

    *Rl = Ray(Ro, Rd, 0.0, length(P - Ro));

    return L;
}

// Intersect ray with light
fn Light_Intersect(light: Light, R: ptr<function, Ray>, T: ptr<function, f32>, L: ptr<function, vec3<f32> >, pPdf: ptr<function, f32>) -> bool {
    if (light.m_T == 0) {
    // Compute projection
        let DotN = dot((*R).m_D, light.m_N);

    // Ray is coplanar with light surface
        if (DotN >= 0.0) {
            return false;
        }

    // Compute hit distance
        *T = (-light.m_distance - dot((*R).m_O, light.m_N)) / DotN;

    // Intersection is in ray's negative direction
        if (*T < (*R).m_MinT || *T > (*R).m_MaxT) {
            return false;
        }

    // Determine position on light
        let Pl = rayAt(*R, *T);

    // Vector from point on area light to center of area light
        let Wl = Pl - light.m_P;

    // Compute texture coordinates
        let UV = vec2<f32>(dot(Wl, light.m_U), dot(Wl, light.m_V));

    // Check if within bounds of light surface
        if (UV.x > light.m_halfWidth || UV.x < -light.m_halfWidth || UV.y > light.m_halfHeight || UV.y < -light.m_halfHeight) {
            return false;
        }

        (*R).m_MaxT = *T;

    //pUV = UV;

        if (DotN < 0.0) {
            *L = RGBtoXYZ(light.m_color) / light.m_area;
        } else {
            *L = BLACK;
        }

        *pPdf = dot((*R).m_O - Pl, (*R).m_O - Pl) / (DotN * light.m_area);

        return true;
    } else if (light.m_T == 1) {
        *T = light.m_skyRadius;

    // Intersection is in ray's negative direction
        if (*T < (*R).m_MinT || *T > (*R).m_MaxT) {
            return false;
        }

        (*R).m_MaxT = *T;

        let UV = vec2<f32>(SphericalPhi((*R).m_D) / (PI * 2.0), SphericalTheta((*R).m_D) / PI);

        *L = Light_Le(light, vec2<f32>(1.0, 1.0) - 2.0 * UV);

        *pPdf = pow(light.m_skyRadius, 2.0) / light.m_area;
    //pUV = UV;

        return true;
    }

    return false;
}

fn Light_Pdf(light: Light, P: vec3<f32>, Wi: vec3<f32>) -> f32 {
    var L:vec3<f32>;
    var UV:vec2<f32>;
    var Pdf = 1.0;

    var Rl = Ray(P, Wi, 0.0, 100000.0);

    if (light.m_T == 0) {
        var T = 0.0;

        if (!Light_Intersect(light, &Rl, &T, &L, &Pdf)) {
            return 0.0;
        }

        return pow(T, 2.0) / (abs(dot(light.m_N, -Wi)) * light.m_area);
    } else if (light.m_T == 1) {
        return pow(light.m_skyRadius, 2.0) / light.m_area;
    }

    return 0.0;
}

struct CVolumeShader {
   m_Type: i32, // 0 = bsdf, 1 = phase

   m_Kd: vec3<f32>, // isotropic phase // xyz color
   m_R: vec3<f32>, // specular reflectance
  m_Ior: f32,
  m_Exponent: f32,
   m_Nn: vec3<f32>,
   m_Nu: vec3<f32>,
   m_Nv: vec3<f32>,
};

// return a xyz color
fn ShaderPhase_F(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> vec3<f32> {
    return shader.m_Kd / PI;
}

fn ShaderPhase_Pdf(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> f32 {
    return (0.25 / PI);
}

fn ShaderPhase_SampleF(shader: CVolumeShader, Wo: vec3<f32>, Wi: ptr<function, vec3<f32> >, Pdf: ptr<function, f32>, U: vec2<f32>) -> vec3<f32> {
    *Wi = getUniformSphereSample(U);
    *Pdf = ShaderPhase_Pdf(shader, Wo, *Wi);

    return ShaderPhase_F(shader, Wo, *Wi);
}

// return a xyz color
fn Lambertian_F(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> vec3<f32> {
    return shader.m_Kd / PI;
}

fn Lambertian_Pdf(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> f32 {
  //return abs(Wi.z)*INV_PI;
    return select(0.0, abs(Wi.z) / PI, SameHemisphere(Wo, Wi));
}

// return a xyz color
fn Lambertian_SampleF(shader: CVolumeShader, Wo: vec3<f32>, Wi: ptr<function, vec3<f32> >, Pdf: ptr<function, f32>, U: vec2<f32>) -> vec3<f32> {
    *Wi = getCosineWeightedHemisphereSample(U);

    if (Wo.z < 0.0) {
        (*Wi).z = -((*Wi).z);
    }

    *Pdf = Lambertian_Pdf(shader, Wo, *Wi);

    return Lambertian_F(shader, Wo, *Wi);
}

fn SphericalDirection(SinTheta: f32, CosTheta: f32, Phi: f32) -> vec3<f32> {
    return vec3<f32>(SinTheta * cos(Phi), SinTheta * sin(Phi), CosTheta);
}

fn Blinn_SampleF(shader: CVolumeShader, Wo: vec3<f32>, Wi: ptr<function, vec3<f32> >, Pdf: ptr<function, f32>, U: vec2<f32>) -> void {
  // Compute sampled half-angle vector wh for Blinn distribution
    let costheta = pow(U.x, 1.0 / (shader.m_Exponent + 1.0));
    let sintheta = sqrt(max(0.0, 1.0 - costheta * costheta));
    let phi = U.y * 2.0 * PI;

    var wh = SphericalDirection(sintheta, costheta, phi);

    if (!SameHemisphere(Wo, wh)) {
        wh = -wh;
    }

  // Compute incident direction by reflecting about $\wh$
    *Wi = -Wo + 2.0 * dot(Wo, wh) * wh;

  // Compute PDF for wi from Blinn distribution
    var blinn_pdf = ((shader.m_Exponent + 1.0) * pow(costheta, shader.m_Exponent)) / (2.0 * PI * 4.0 * dot(Wo, wh));

    if (dot(Wo, wh) <= 0.0) {
        blinn_pdf = 0.0;
    }

    *Pdf = blinn_pdf;
}

fn Blinn_D(shader: CVolumeShader, wh: vec3<f32>) -> f32 {
    let costhetah = abs(wh.z);//AbsCosTheta(wh);
    return (shader.m_Exponent + 2.0) * (0.5 / PI) * pow(costhetah, shader.m_Exponent);
}

fn Microfacet_G(shader: CVolumeShader, wo: vec3<f32>, wi: vec3<f32>, wh: vec3<f32>) -> f32 {
    let NdotWh = abs(wh.z);//AbsCosTheta(wh);
    let NdotWo = abs(wo.z);//AbsCosTheta(wo);
    let NdotWi = abs(wi.z);//AbsCosTheta(wi);
    let WOdotWh = abs(dot(wo, wh));

    return min(1.0, min((2.0 * NdotWh * NdotWo / WOdotWh), (2.0 * NdotWh * NdotWi / WOdotWh)));
}

fn Microfacet_F(shader: CVolumeShader, wo: vec3<f32>, wi: vec3<f32>) -> vec3<f32> {
    let cosThetaO = abs(wo.z);//AbsCosTheta(wo);
    let cosThetaI = abs(wi.z);//AbsCosTheta(wi);

    if (cosThetaI == 0.0 || cosThetaO == 0.0) {
        return BLACK;
    }

    var wh = wi + wo;

    if (wh.x == 0.0 && wh.y == 0.0 && wh.z == 0.0) {
        return BLACK;
    }

    wh = normalize(wh);
    let cosThetaH = dot(wi, wh);

    let F = WHITE;//m_Fresnel.Evaluate(cosThetaH);

    return shader.m_R * Blinn_D(shader, wh) * Microfacet_G(shader, wo, wi, wh) * F / (4.0 * cosThetaI * cosThetaO);
}

fn ShaderBsdf_WorldToLocal(shader: CVolumeShader, W: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(dot(W, shader.m_Nu), dot(W, shader.m_Nv), dot(W, shader.m_Nn));
}

fn ShaderBsdf_LocalToWorld(shader: CVolumeShader, W: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(shader.m_Nu.x * W.x + shader.m_Nv.x * W.y + shader.m_Nn.x * W.z, shader.m_Nu.y * W.x + shader.m_Nv.y * W.y + shader.m_Nn.y * W.z, shader.m_Nu.z * W.x + shader.m_Nv.z * W.y + shader.m_Nn.z * W.z);
}

fn Blinn_Pdf(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> f32 {
    let wh = normalize(Wo + Wi);

    let costheta = abs(wh.z);//AbsCosTheta(wh);
  // Compute PDF for wi from Blinn distribution
    var blinn_pdf = ((shader.m_Exponent + 1.0) * pow(costheta, shader.m_Exponent)) / (2.0 * PI * 4.0 * dot(Wo, wh));

    if (dot(Wo, wh) <= 0.0) {
        blinn_pdf = 0.0;
    }

    return blinn_pdf;
}

fn Microfacet_SampleF(shader: CVolumeShader, wo: vec3<f32>, wi: ptr<function,vec3<f32> >, Pdf: ptr<function,f32>, U: vec2<f32>) -> vec3<f32> {
    Blinn_SampleF(shader, wo, wi, Pdf, U);

    if (!SameHemisphere(wo, *wi)) {
        return BLACK;
    }

    return Microfacet_F(shader, wo, *wi);
}

fn Microfacet_Pdf(shader: CVolumeShader, wo: vec3<f32>, wi: vec3<f32>) -> f32 {
    if (!SameHemisphere(wo, wi)) {
        return 0.0;
    }

    return Blinn_Pdf(shader, wo, wi);
}

// return a xyz color
fn ShaderBsdf_F(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> vec3<f32> {
    let Wol = ShaderBsdf_WorldToLocal(shader, Wo);
    let Wil = ShaderBsdf_WorldToLocal(shader, Wi);

    var R = vec3<f32>(0.0, 0.0, 0.0);

    R = R + Lambertian_F(shader, Wol, Wil);
    R = R + Microfacet_F(shader, Wol, Wil);

    return R;
}

fn ShaderBsdf_Pdf(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> f32 {
    let Wol = ShaderBsdf_WorldToLocal(shader, Wo);
    let Wil = ShaderBsdf_WorldToLocal(shader, Wi);

    var Pdf = 0.0;

    Pdf = Pdf + Lambertian_Pdf(shader, Wol, Wil);
    Pdf = Pdf + Microfacet_Pdf(shader, Wol, Wil);

    return Pdf;
}

fn ShaderBsdf_SampleF(shader: CVolumeShader, S: CLightingSample, Wo: vec3<f32>, Wi: ptr<function, vec3<f32> >, Pdf: ptr<function, f32>, U: vec2<f32>) -> vec3<f32> {
    let Wol = ShaderBsdf_WorldToLocal(shader, Wo);
    var Wil = vec3<f32>(0.0, 0.0, 0.0);

    var R = vec3<f32>(0.0, 0.0, 0.0);

    if (S.m_bsdfComponent <= 0.5) {
        Lambertian_SampleF(shader, Wol, &Wil, Pdf, S.m_bsdfDir);
    } else {
        Microfacet_SampleF(shader, Wol, &Wil, Pdf, S.m_bsdfDir);
    }

    *Pdf = *Pdf + Lambertian_Pdf(shader, Wol, Wil);
    *Pdf = *Pdf + Microfacet_Pdf(shader, Wol, Wil);

    R = R + Lambertian_F(shader, Wol, Wil);
    R = R + Microfacet_F(shader, Wol, Wil);

    *Wi = ShaderBsdf_LocalToWorld(shader, Wil);

  //return vec3<f32>(1,1,1);
    return R;
}

// return a xyz color
fn Shader_F(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> vec3<f32> {
    if (shader.m_Type == 0) {
        return ShaderBsdf_F(shader, Wo, Wi);
    } else {
        return ShaderPhase_F(shader, Wo, Wi);
    }
}

fn Shader_Pdf(shader: CVolumeShader, Wo: vec3<f32>, Wi: vec3<f32>) -> f32 {
    if (shader.m_Type == 0) {
        return ShaderBsdf_Pdf(shader, Wo, Wi);
    } else {
        return ShaderPhase_Pdf(shader, Wo, Wi);
    }
}

fn Shader_SampleF(shader: CVolumeShader, S: CLightingSample, Wo: vec3<f32>, Wi: ptr<function, vec3<f32> >, Pdf: ptr<function, f32>, U: vec2<f32>) -> vec3<f32> {
  //return vec3<f32>(1,0,0);
    if (shader.m_Type == 0) {
        return ShaderBsdf_SampleF(shader, S, Wo, Wi, Pdf, U);
    } else {
        return ShaderPhase_SampleF(shader, Wo, Wi, Pdf, U);
    }
}

fn IsBlack(v: vec3<f32>) -> bool {
    return (v.x == 0.0 && v.y == 0.0 && v.z == 0.0);
}

fn PowerHeuristic(nf: f32, fPdf: f32, ng: f32, gPdf: f32) -> f32 {
    let f = nf * fPdf;
    let g = ng * gPdf;
    return (f * f) / (f * f + g * g);
}

// "shadow ray" using gParams.gStepSizeShadow, test whether it can exit the volume or not
fn FreePathRM(R: ptr<function, Ray>) -> bool {
    var MinT: f32;
    var MaxT: f32;
    var Ps: vec3<f32>;

    if (!IntersectBox(*R, &MinT, &MaxT)) {
        return false;
    }

    MinT = max(MinT, (*R).m_MinT);
    MaxT = min(MaxT, (*R).m_MaxT);

    var S = -log(rand()) / gParams.gDensityScale;
    var Sum = 0.0;
    var SigmaT = 0.0;

    MinT = MinT + rand() * gParams.gStepSizeShadow;
    var ch:i32 = 0;
    var intensity:f32 = 0.0;
    loop {
        if (Sum >= S) {
      break;
        }

        Ps = rayAt(*R, MinT);  // R.m_O + MinT * R.m_D;

        if (MinT > MaxT) {
            return false;
        }

        intensity = GetNormalizedIntensityMax4ch(Ps, &ch);
        SigmaT = gParams.gDensityScale * GetOpacity(intensity, ch);

        Sum = Sum + SigmaT * gParams.gStepSizeShadow;
        MinT = MinT + gParams.gStepSizeShadow;
    }

    return true;
}


fn NearestLight(R: Ray, LightColor: ptr<function, vec3<f32> >, Pl: ptr<function, vec3<f32> >, oPdf: ptr<function, f32>) -> i32 {
    var Hit:i32 = -1;

    var T:f32 = 0.0;

    var RayCopy:Ray;
    RayCopy = R;

    var Pdf:f32 = 0.0;

    for (var i = 0; i < NUM_LIGHTS; i = i + 1) {
        if (Light_Intersect(gLights.lights[i], &RayCopy, &T, LightColor, &Pdf)) {
            *Pl = rayAt(R, T);
            Hit = i;
        }
    }

    *oPdf = Pdf;

    return Hit;
}

// return a XYZ color
fn EstimateDirectLight(shaderType: i32, Density: f32, ch: i32, light: Light, LS: CLightingSample, Wo: vec3<f32>, Pe: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
    var Ld = BLACK;
    var Li = BLACK;
    var F = BLACK;

    let diffuse = GetDiffuseN(Density, ch);
    let specular = GetSpecularN(Density, ch);
    let roughness = GetRoughnessN(Density, ch);

    let nu = normalize(cross(N, Wo));
    let nv = normalize(cross(N, nu));
    let Shader = CVolumeShader(shaderType, RGBtoXYZ(diffuse), RGBtoXYZ(specular), 2.5, roughness, N, nu, nv);

    var LightPdf = 1.0;
    var ShaderPdf = 1.0;


    var Rl = Ray(vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), 0.0, 1500000.0);
    Li = Light_SampleL(light, Pe, &Rl, &LightPdf, LS);

    var Wi = -Rl.m_D;
    let P = vec3<f32>(0.0, 0.0, 0.0);

    F = Shader_F(Shader, Wo, Wi);

    ShaderPdf = Shader_Pdf(Shader, Wo, Wi);

    if (!IsBlack(Li) && (ShaderPdf > 0.0) && (LightPdf > 0.0) && !FreePathRM(&Rl)) {
        let WeightMIS = PowerHeuristic(1.0, LightPdf, 1.0, ShaderPdf);

        if (shaderType == ShaderType_Brdf) {
            Ld = Ld + F * Li * abs(dot(Wi, N)) * WeightMIS / LightPdf;
        } else if (shaderType == ShaderType_Phase) {
            Ld = Ld + F * Li * WeightMIS / LightPdf;
        }
    }

    F = Shader_SampleF(Shader, LS, Wo, &Wi, &ShaderPdf, LS.m_bsdfDir);

    if (!IsBlack(F) && (ShaderPdf > 0.0)) {
        var Pl = vec3<f32>(0.0, 0.0, 0.0);
        let n = NearestLight(Ray(Pe, Wi, 0.0, 1000000.0), &Li, &Pl, &LightPdf);
        if (n > -1) {
            let pLight = gLights.lights[n];
            LightPdf = Light_Pdf(pLight, Pe, Wi);

            if ((LightPdf > 0.0) && !IsBlack(Li)) {
                var rr = Ray(Pl, normalize(Pe - Pl), 0.0, length(Pe - Pl));
                if (!FreePathRM(&rr)) {
                    let WeightMIS = PowerHeuristic(1.0, ShaderPdf, 1.0, LightPdf);

                    if (shaderType == ShaderType_Brdf) {
                        Ld = Ld + F * Li * abs(dot(Wi, N)) * WeightMIS / ShaderPdf;
                    } else if (shaderType == ShaderType_Phase) {
                        Ld = Ld + F * Li * WeightMIS / ShaderPdf;
                    }
                }
            }
        }
    }

  //return vec3<f32>(1,1,1);
    return Ld;
}

// return a linear xyz color
fn UniformSampleOneLight(shaderType: i32, Density: f32, ch: i32, Wo: vec3<f32>, Pe: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  //if (NUM_LIGHTS == 0)
  //  return BLACK;

  // select a random light, a random 2d sample on light, and a random 2d sample on brdf
    let LS = LightingSample_LargeStep();

    let WhichLight = i32(floor(LS.m_LightNum * f32(NUM_LIGHTS)));

    let light = gLights.lights[WhichLight];

    return f32(NUM_LIGHTS) * EstimateDirectLight(shaderType, Density, ch, light, LS, Wo, Pe, N);
}

fn SampleDistanceRM(R: Ray, Ps: ptr<function, vec3<f32> >) -> bool {
    var MinT:f32 = 0.0;
    var MaxT:f32 = 0.0;

    if (!IntersectBox(R, &MinT, &MaxT)) {
        return false;
    }
    MinT = max(MinT, R.m_MinT);
    MaxT = min(MaxT, R.m_MaxT);

  // ray march along the ray's projected path and keep an average sigmaT value.
  // The distance is weighted by the intensity at each ray step sample. High intensity increases the apparent distance.
  // When the distance has become greater than the average sigmaT value given by -log(RandomFloat[0, 1]) / averageSigmaT
  // then that would be considered the interaction position.

  // sigmaT = sigmaA + sigmaS = absorption coeff + scattering coeff = extinction coeff

  // Beer-Lambert law: transmittance T(t) = exp(-sigmaT*t)
  // importance sampling the exponential function to produce a free path distance S
  // the PDF is p(t) = sigmaT * exp(-sigmaT * t)
  // S is the free-path distance = -ln(1-zeta)/sigmaT where zeta is a random variable
    let S = -log(rand()) / gParams.gDensityScale;  // note that ln(x:0..1) is negative

  // density scale 0... S --> 0..inf.  Low density means randomly sized ray paths
  // density scale inf... S --> 0.   High density means short ray paths!
    var Sum = 0.0;
    var SigmaT = 0.0; // accumulated extinction along ray march

    MinT = MinT + (rand() * gParams.gStepSize);
    var ch:i32 = 0;
    var intensity = 0.0;
  // ray march until we have traveled S (or hit the maxT of the ray)
    loop {
        if (Sum >= S) {
      break;
        }
        *Ps = rayAt(R, MinT);  // R.m_O + MinT * R.m_D;

        if (MinT > MaxT) {
            return false;
        }

        intensity = GetNormalizedIntensityMax4ch(*Ps, &ch);
        SigmaT = gParams.gDensityScale * GetOpacity(intensity, ch);

        Sum = Sum + SigmaT * gParams.gStepSize;
        MinT = MinT + gParams.gStepSize;
    }

  // Ps is the point
    return true;
}


fn CalculateRadiance(in: VertexOutput) -> vec4<f32> {
    let r = rand();
  //return vec4<f32>(r,0,0,1);

    var Lv:vec3<f32> = BLACK;
    var Li:vec3<f32> = BLACK;

  //Ray Re = Ray(vec3<f32>(0,0,0), vec3<f32>(0,0,1), 0.0, 1500000.0);

    let UV:vec2<f32> = in.vUv * gComposite.uResolution + vec2<f32>(rand(), rand());

    let Re:Ray = GenerateCameraRay(gCamera, UV, vec2<f32>(rand(), rand()));

  //return vec4<f32>(UV, 0.0, 1.0);
  //return vec4<f32>(0.5*(Re.m_D + 1.0), 1.0);
  //return vec4<f32>(Re.m_D, 1.0);

  //Re.m_MinT = 0.0f;
  //Re.m_MaxT = 1500000.0f;

    var Pe = vec3<f32>(0.0, 0.0, 0.0);
    var Pl = vec3<f32>(0.0, 0.0, 0.0);
    var lpdf:f32 = 0.0;
    var alpha:f32 = 0.0;

  // find point Pe along ray Re
    if (SampleDistanceRM(Re, &Pe)) {
        alpha = 1.0;
    //return vec4<f32>(1.0, 1.0, 1.0, 1.0);

    // is there a light between Re.m_O and Pe? (ray's maxT is distance to Pe)
    // (test to see if area light was hit before volume.)
        let i = NearestLight(Ray(Re.m_O, Re.m_D, 0.0, length(Pe - Re.m_O)), &Li, &Pl, &lpdf);
        if (i > -1) {
      // set sample pixel value in frame estimate (prior to accumulation)
            return vec4<f32>(Li, 1.0);
        }

        var ch:i32 = 0;
        let D:f32 = GetNormalizedIntensityMax4ch(Pe, &ch);

    // emission from volume
        Lv = Lv + RGBtoXYZ(GetEmissionN(D, ch));

        let gradient:vec3<f32> = Gradient4ch(Pe, ch);

    //Lv = Lv + RGBtoXYZ(D*GetDiffuseN(D, ch));
        Lv = Lv + UniformSampleOneLight(ShaderType_Brdf, D, ch, normalize(-Re.m_D), Pe, normalize(gradient));
    //Lv = Lv + 0.5 * UniformSampleOneLight(ShaderType_Phase, D, ch, normalize(-Re.m_D), Pe, normalize(gradient));

    // send ray out from Pe toward light

    // switch (gParams.gShadingType)
    // {
    //   case 0:
    //   {
    //     Lv = Lv + UniformSampleOneLight(ShaderType_Brdf, D, ch, normalize(-Re.m_D), Pe, normalize(gradient));
    //     break;
    //   }

    //   case 1:
    //   {
    //     Lv = Lv + 0.5 * UniformSampleOneLight(ShaderType_Phase, D, ch, normalize(-Re.m_D), Pe, normalize(gradient));
    //     break;
    //   }

    //   case 2:
    //   {
    //     //const f32 GradMag = GradientMagnitude(Pe, volumedata.gradientVolumeTexture[ch]) * (1.0/volumedata.intensityMax[ch]);
    //     let GradMag = length(gradient);
    //     let PdfBrdf = (1.0 - exp(-gParams.gGradientFactor * GradMag));

    //     var cls:vec3<f32>; // xyz color
    //     if (rand() < PdfBrdf) {
    //       cls = UniformSampleOneLight(ShaderType_Brdf, D, ch, normalize(-Re.m_D), Pe, normalize(gradient));
    //     }
    //     else {
    //       cls = 0.5 * UniformSampleOneLight(ShaderType_Phase, D, ch, normalize(-Re.m_D), Pe, normalize(gradient));
    //     }

    //     Lv = Lv + cls;

    //     break;
    //   }
    //   default: {
    //     break;
    //   }
    // }

    //Lv = RGBtoXYZ(vec3<f32>(0.0, 1.0, 0.0));
    } else {
    // background color:
    // set Lv to a selected color based on environment light source?
//    if (uShowLights > 0.0) {
//      i32 n = NearestLight(Ray(Re.m_O, Re.m_D, 0.0f, 1000000.0f), Li, Pl, lpdf);
//      if (n > -1)
//        Lv = Li;
//    }

//    Lv = RGBtoXYZ(vec3<f32>(1.0, 0.0, 0.0));
    }

  // set sample pixel value in frame estimate (prior to accumulation)

  // TEST BOX INTERSECTION
  // alpha = 1.0;
  // var MinT: f32;
  // var MaxT: f32;
  // if (!IntersectBox(Re, &MinT, &MaxT)) {
  //     Lv = vec3<f32>(1.0, 0.0, 0.0);
  // }
  // else {
  //   MinT = max(MinT, Re.m_MinT);
  //   MaxT = min(MaxT, Re.m_MaxT);
  //   MinT = MinT + rand() * gParams.gStepSize;
  //   if (MinT > MaxT) {
  //     Lv = vec3<f32>(0.0, 1.0, 0.0);
  //   }
  //   else {
  //     let pp = rayAt(Re, MinT);  // R.m_O + MinT * R.m_D;
  //     let uvw = PtoVolumeTex(pp);
  //     let intensity:vec4<f32> =
  //       textureSampleLevel(volumeTexture, volumeTextureSampler, uvw, 0.0);
  //     Lv = vec3<f32>(intensity.x, intensity.y, intensity.z);
  //   }
  // }



    return vec4<f32>(Lv, alpha);

  // test uv coords
  //return vec4<f32>(in.vUv, 0.0, 1.0);
  // test camera dir
  //return vec4<f32>(vec3<f32>(0.5,0.5,0.5)*(Re.m_D + vec3<f32>(1.0,1.0, 1.0)), 1.0);
  //return vec4<f32>(Re.m_D, 1.0);
}

fn CumulativeMovingAverage(A: vec4<f32>, Ax: vec4<f32>, N: f32) -> vec4<f32> {
    return A + ((Ax - A) / max((N), 1.0));
}

@fragment
fn main_fs(
    in: VertexOutput,
) -> @location(0) vec4<f32> {
    var out_FragColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);

  // seed for rand(seed) function
    seed = vec2<u32>(
        u32(gComposite.uFrameCounter * in.clip_position.x * gComposite.uResolution.x),
        u32((gComposite.uFrameCounter + 1.0) * in.clip_position.y * gComposite.uResolution.y)
    );

  // perform path tracing and get resulting pixel color
    let pixelColor:vec4<f32> = CalculateRadiance(in);

    var previousColor:vec4<f32> = textureLoad(tPreviousTexture, vec2<i32>(in.vUv * gComposite.uResolution), 0);
    if (gComposite.uSampleCounter < 1.0) {
        previousColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    out_FragColor = CumulativeMovingAverage(previousColor, pixelColor, gComposite.uSampleCounter);
    return out_FragColor;
}

