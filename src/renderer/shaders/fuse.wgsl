struct FuseLUT {
  // 256 rgba values (breaking the intensity range into 256 steps - for 8bit intensity this is 1-1)
  lookup: array<vec4<f32>, 256>
// alternative is to try simple min/max+color and do the interp in shader.
// but then you don't get to do crazy gradients and transfer functions
};

@group(0) @binding(0) var dest : texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var src : texture_3d<f32>;
@group(0) @binding(2) var accum : texture_3d<f32>;
// should be texture+sampler?
@group(0) @binding(3) var<uniform> lut: FuseLUT;

@stage(compute) @workgroup_size(1, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // load from channel
    let intensity : f32 = textureLoad(src, vec3<i32>(global_id.xyz), 0).r;
    // load from current accumulation texture
    let cur : vec4<f32> = textureLoad(accum, vec3<i32>(global_id.xyz), 0);


    // apply lut to intensity:
    var pix : vec4<f32> = lut.lookup[i32(intensity * 255.0)];
    //pix = pix * intensity;
    // combine
    pix = max(cur, pix);

    // write to destination
    textureStore(dest, vec3<i32>(global_id.xyz), pix);
}

