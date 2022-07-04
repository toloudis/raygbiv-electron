import { Shader } from "./shader";

// consider using readFileSync here to skip the fetch step
import * as ptvolume_wgsl from "./shaders/ptvolume.wgsl";

class VolumeShader extends Shader {
  constructor() {
    super(ptvolume_wgsl as unknown as string);
    // super(
    //   volume_vert_spv as unknown as string,
    //   volume_frag_spv as unknown as string
    // );
  }

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...
    // Note: You could include these binaries as variables in your
    // javascript source.

    await this.loadModules();

    // Bind Group Layout
    this.uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
        {
          binding: 1, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" as GPUSamplerBindingType },
        },
        {
          binding: 2, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "float" as GPUTextureSampleType,
            viewDimension: "3d" as GPUTextureViewDimension,
          },
        },
        {
          binding: 3, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
      ],
    });
    this.pipelineLayout = this.device.createPipelineLayout({
      // order here set number from the glsl
      bindGroupLayouts: [this.uniformBindGroupLayout],
    });
    console.log("pipeline and uniform group layouts created");
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
      layout: this.uniformBindGroupLayout,
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
      module: this.vertModule,
      entryPoint: this.vsEntry,
    };
    return vertexState;
  }

  // Shader Modules
  getVertexStage(): GPUProgrammableStage {
    return { module: this.vertModule, entryPoint: this.vsEntry };
  }

  getFragmentStage(): GPUProgrammableStage {
    return {
      module: this.fragModule,
      entryPoint: this.fsEntry,
    };
  }

  getPipelineLayout(): GPUPipelineLayout {
    return this.pipelineLayout;
  }
}
