@group(0) @binding(0) var dest : texture_storage_3d<rgba8unorm,write>;
@group(0) @binding(1) var dest2 : texture_storage_3d<rgba8unorm,write>;

// fill with zeros!
@compute @workgroup_size(1, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    textureStore(dest, vec3<i32>(global_id.xyz), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    textureStore(dest2, vec3<i32>(global_id.xyz), vec4<f32>(0.0, 0.0, 0.0, 0.0));
}
