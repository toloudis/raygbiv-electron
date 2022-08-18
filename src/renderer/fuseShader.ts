import { Shader } from "./shader";

// consider using readFileSync here to skip the fetch step
import * as fuse_wgsl from "./shaders/fuse.wgsl";

class FuseShader extends Shader {
  computePipeline: GPUComputePipeline;
  workgroupSize: [number, number, number] = [8, 8, 1];

  constructor() {
    super(fuse_wgsl as unknown as string);
  }

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...

    await this.loadModules();

    this.bindGroupLayouts = this.createBindGroupLayouts(device);
    this.pipelineLayout = device.createPipelineLayout({
      label: "fuse pipeline layout",
      bindGroupLayouts: this.bindGroupLayouts,
    });

    this.computePipeline = device.createComputePipeline({
      label: "fuse compute pipeline",
      layout: this.pipelineLayout,
      compute: { module: this.shaderModule, entryPoint: "main" },
    });

    console.log("pipeline and uniform group layouts created");
  }

  private createBindGroupLayouts(device: GPUDevice): GPUBindGroupLayout[] {
    const bindGroupLayout0 = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only" as GPUStorageTextureAccess,
            format: "rgba8unorm" as GPUTextureFormat,
            viewDimension: "3d" as GPUTextureViewDimension,
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: "float" as GPUTextureSampleType,
            viewDimension: "3d" as GPUTextureViewDimension,
          },
        },
      ],
    });
    const bindGroupLayout1 = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: "float" as GPUTextureSampleType,
            viewDimension: "3d" as GPUTextureViewDimension,
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            // input buffer or output buffer
            type: "uniform" as GPUBufferBindingType,
            hasDynamicOffset: false,
          },
        },
      ],
    });
    return [bindGroupLayout0, bindGroupLayout1];
  }
}
export { FuseShader };

// def prepare_fuse(self, device: wgpu.GPUDevice):
// self.clearfuseshader = graphics.initshader(device, "clearfuse.wgsl")

// self.clearfuseshader = graphics.initshader(device, "clearfuse.wgsl")
// self.fused_texture = device.create_texture(
//     size=(self.pixel_dims[2], self.pixel_dims[1], self.pixel_dims[0]),
//     dimension="3d",
//     format=wgpu.TextureFormat.rgba8unorm,
//     usage=wgpu.TextureUsage.TEXTURE_BINDING
//     | wgpu.TextureUsage.STORAGE_BINDING
//     | wgpu.TextureUsage.COPY_SRC,
//     label="volume fused texture rgba8unorm ping",
// )
// self.fused_texture_temp = device.create_texture(
//     size=(self.pixel_dims[2], self.pixel_dims[1], self.pixel_dims[0]),
//     dimension="3d",
//     format=wgpu.TextureFormat.rgba8unorm,
//     usage=wgpu.TextureUsage.TEXTURE_BINDING | wgpu.TextureUsage.STORAGE_BINDING,
//     label="volume fused texture rgba8unorm pong",
// )
// self.fused_texture_view = self.fused_texture.create_view()
// self.fused_texture_temp_view = self.fused_texture_temp.create_view()

// prefuse_binding_layouts = [
//     {
//         "binding": 0,
//         "visibility": wgpu.ShaderStage.COMPUTE,
//         "storage_texture": {
//             "access": wgpu.StorageTextureAccess.write_only,
//             "format": wgpu.TextureFormat.rgba8unorm,
//             "view_dimension": wgpu.TextureViewDimension.d3,
//         },
//     },
//     {
//         "binding": 1,
//         "visibility": wgpu.ShaderStage.COMPUTE,
//         "storage_texture": {
//             "access": wgpu.StorageTextureAccess.write_only,
//             "format": wgpu.TextureFormat.rgba8unorm,
//             "view_dimension": wgpu.TextureViewDimension.d3,
//         },
//     },
// ]
// self.prefuse_bind_group_layout = device.create_bind_group_layout(
//     entries=prefuse_binding_layouts
// )
// self.prefuse_pipeline_layout = device.create_pipeline_layout(
//     bind_group_layouts=[self.prefuse_bind_group_layout]
// )
// self.prefuse_compute_pipeline = device.create_compute_pipeline(
//     layout=self.prefuse_pipeline_layout,
//     compute={"module": self.clearfuseshader, "entry_point": "main"},
// )
