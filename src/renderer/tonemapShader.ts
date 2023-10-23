import { Shader } from "./shader";

// consider using readFileSync here to skip the fetch step
import * as tonemap_wgsl from "./shaders/tonemap.wgsl";

class TonemapShader extends Shader {
  constructor() {
    super(tonemap_wgsl as unknown as string);
  }

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...

    await this.loadModules();

    this.bindGroupLayouts = this.createBindGroupLayouts(device);
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
          sampler: { type: "non-filtering" as GPUSamplerBindingType },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "unfilterable-float" as GPUTextureSampleType,
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

export { TonemapShader };

// exposure_dtype = [
//     ("exposure", "f4"),
//     ("pad0", "f4", (3)),
// ]
