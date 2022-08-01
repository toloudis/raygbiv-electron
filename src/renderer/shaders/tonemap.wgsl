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

struct Exposure {
  exposure: f32
};

@group(0) @binding(0)
var<uniform> gExposure: Exposure;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var tTexture0: texture_2d<f32>;

// Used to convert from XYZ to linear RGB space
var<private> XYZ_2_RGB: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(3.2404542, -1.5371385, -0.4985314),
    vec3<f32>(-0.9692660, 1.8760108, 0.0415560),
    vec3<f32>(0.0556434, -0.2040259, 1.0572252)
);

fn XYZtoRGB(xyz: vec3<f32>) -> vec3<f32> {
  //return xyz;
    return xyz * XYZ_2_RGB;
}

@fragment
fn main_fs(
    in: VertexOutput,
) -> @location(0) vec4<f32> {
    // TODO: check for x or y flip? wrt. vUv values
    var pixelColor:vec4<f32> = textureSample(tTexture0, textureSampler, in.vUv);
    pixelColor = vec4<f32>(XYZtoRGB(pixelColor.rgb), pixelColor.a);
    pixelColor = vec4<f32>(vec3<f32>(1.0, 1.0, 1.0) - exp(-pixelColor.rgb * gExposure.exposure), pixelColor.a);
    pixelColor = clamp(pixelColor, vec4<f32>(0.0, 0.0, 0.0, 0.0), vec4<f32>(1.0, 1.0, 1.0, 1.0));
    return pixelColor;
}