import { Shader } from "./shader";

// consider using readFileSync here to skip the fetch step
import * as ptvolume_wgsl from "./shaders/ptvolume.wgsl";

class VolumeShader extends Shader {
  constructor() {
    super(ptvolume_wgsl as unknown as string);
  }

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...

    await this.loadModules();

    this.createBindGroupLayouts(device);
    this.pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: this.bindGroupLayouts,
    });

    const positionAttribDesc: GPUVertexAttribute = {
      shaderLocation: 0, // [[attribute(0)]]
      offset: 0,
      format: "float32x2",
    };
    const positionBufferDesc: GPUVertexBufferLayout = {
      attributes: [positionAttribDesc],
      arrayStride: 4 * 2,
      stepMode: "vertex",
    };
    this.vertexState = {
      buffers: [positionBufferDesc],
      module: this.shaderModule,
      entryPoint: "main_vs",
    };

    console.log("pipeline and uniform group layouts created");
  }

  private createBindGroupLayouts(device: GPUDevice): GPUBindGroupLayout[] {
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" as GPUSamplerBindingType },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "float" as GPUTextureSampleType,
            viewDimension: "3d" as GPUTextureViewDimension,
          },
        },
        {
          binding: 7,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" as GPUSamplerBindingType },
        },
        {
          binding: 8,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "float" as GPUTextureSampleType,
            viewDimension: "2d" as GPUTextureViewDimension,
          },
        },
        // NEED DIFFERENT SAMPLER FOR THIS?
        // this is just using a nearest,nearest sampler
        {
          binding: 9,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "float" as GPUTextureSampleType,
            viewDimension: "2d" as GPUTextureViewDimension,
          },
        },
      ],
    });
    return [bindGroupLayout];
  }

  public createShaderBindGroup(
    uniformBuffer: GPUBuffer,
    volSampler: GPUSampler,
    volTex: GPUTextureView,
    uniformParamsBuffer: GPUBuffer
  ): GPUBindGroup {
    //  Bind Group
    // This would be used when encoding commands
    return this.device.createBindGroup({
      layout: this.bindGroupLayouts[0],
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
        {
          binding: 1,
          resource: volSampler,
        },
        {
          binding: 2,
          resource: volTex,
        },
        {
          binding: 3,
          resource: { buffer: uniformParamsBuffer },
        },
      ],
    });
  }

  // TODO customize this for each shader (mesh, volume)
  getVertexStateDesc(): GPUVertexState {
    // Input Assembly
    const positionAttribDesc: GPUVertexAttribute = {
      shaderLocation: 0, // [[attribute(0)]]
      offset: 0,
      format: "float32x3",
    };
    const positionBufferDesc: GPUVertexBufferLayout = {
      attributes: [positionAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: "vertex",
    };

    const vertexState: GPUVertexState = {
      buffers: [positionBufferDesc],
      module: this.shaderModule,
      entryPoint: this.vsEntry,
    };
    return vertexState;
  }

  // Shader Modules
  getVertexStage(): GPUProgrammableStage {
    return { module: this.shaderModule, entryPoint: this.vsEntry };
  }

  getFragmentStage(): GPUProgrammableStage {
    return {
      module: this.shaderModule,
      entryPoint: this.fsEntry,
    };
  }

  getPipelineLayout(): GPUPipelineLayout {
    return this.pipelineLayout;
  }
}

export { VolumeShader };

//# shader has shader, bind_group_layouts, pipeline_layout, and vertex_state
// camera_dtype = [
//     ("from", "f4", (3)),
//     ("pad0", "f4"),
//     ("U", "f4", (3)),
//     ("pad1", "f4"),
//     ("V", "f4", (3)),
//     ("pad2", "f4"),
//     ("N", "f4", (3)),
//     ("pad3", "f4"),
//     ("screen", "f4", (4)),
//     ("invScreen", "f4", (2)),
//     ("focalDistance", "f4"),
//     ("apertureSize", "f4"),
//     ("isPerspective", "f4"),
//     ("pad4", "f4", (3)),
// ]
// light_dtype = [
//     ("theta", "f4"),
//     ("phi", "f4"),
//     ("width", "f4"),
//     ("halfWidth", "f4"),
//     ("height", "f4"),
//     ("halfHeight", "f4"),
//     ("distance", "f4"),
//     ("skyRadius", "f4"),
//     ("area", "f4"),
//     ("areaPdf", "f4"),
//     ("T", "i4"),
//     ("pad", "f4"),
//     ("P", "f4", (3)),
//     ("pad0", "f4"),
//     ("target", "f4", (3)),
//     ("pad1", "f4"),
//     ("N", "f4", (3)),
//     ("pad2", "f4"),
//     ("U", "f4", (3)),
//     ("pad3", "f4"),
//     ("V", "f4", (3)),
//     ("pad4", "f4"),
//     ("color", "f4", (3)),
//     ("pad5", "f4"),
//     ("colorTop", "f4", (3)),
//     ("pad6", "f4"),
//     ("colorMiddle", "f4", (3)),
//     ("pad7", "f4"),
//     ("colorBottom", "f4", (3)),
//     ("pad8", "f4"),
// ]

// globalparams_dtype = [
//     ("gClippedAaBbMin", "f4", (3)),
//     ("pad0", "f4"),
//     ("gClippedAaBbMax", "f4", (3)),
//     ("gDensityScale", "f4"),
//     ("gStepSize", "f4"),
//     ("gStepSizeShadow", "f4"),
//     ("pad2", "f4", (2)),
//     ("gInvAaBbSize", "f4", (3)),
//     ("g_nChannels", "i4"),
//     ("gShadingType", "i4"),
//     ("pad3", "f4", (3)),
//     ("gGradientDeltaX", "f4", (3)),
//     ("pad4", "f4"),
//     ("gGradientDeltaY", "f4", (3)),
//     ("pad5", "f4"),
//     ("gGradientDeltaZ", "f4", (3)),
//     ("gInvGradientDelta", "f4"),
//     ("gGradientFactor", "f4"),
//     ("uShowLights", "f4"),
//     ("pad8", "f4", (2)),
// ]

// channels_dtype = [
//     ("g_intensityMax", "f4", (4)),
//     ("g_intensityMin", "f4", (4)),
//     ("g_opacity", "f4", (4)),
//     ("g_emissive", "f4", (4, 4)),
//     ("g_diffuse", "f4", (4, 4)),
//     ("g_specular", "f4", (4, 4)),
//     ("g_roughness", "f4", (4)),
// ]

// # compositing / progressive render
// progressive_dtype = [
//     ("uFrameCounter", "f4"),
//     ("uSampleCounter", "f4"),
//     ("uResolution", "f4", (2)),
// ]
