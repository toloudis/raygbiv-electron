import { createGPUBuffer } from "./bufferUtil";

// consider using readFileSync here to skip the fetch step
import * as volume_wgsl from "./shaders/volume.wgsl";

class Shader {
  protected srcpath = "";
  protected vsEntry = "main_vs";
  protected fsEntry = "main_fs";
  protected device: GPUDevice = null;
  protected pipelineLayout: GPUPipelineLayout = null;

  // usable by renderers
  public shaderModule: GPUShaderModule = null;
  public bindGroupLayouts: GPUBindGroupLayout[] = [];
  public vertexState: GPUVertexState = null;

  private loadShaderWGSL(shaderPath: string) {
    return fetch(new Request(shaderPath), {
      method: "GET",
      mode: "cors",
    }).then((res) => res.text());
  }

  constructor(srcpath: string) {
    this.srcpath = srcpath;
    this.vsEntry = "main_vs";
    this.fsEntry = "main_fs";
  }

  protected async loadModules() {
    const smDesc: GPUShaderModuleDescriptor = {
      code: await this.loadShaderWGSL(this.srcpath),
    };
    this.shaderModule = this.device.createShaderModule(smDesc);

    console.log("shader modules created");
  }

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...
    // Note: You could include these binaries as variables in your
    // javascript source.

    await this.loadModules();
  }

  // TODO customize this for each shader (mesh, volume)
  getVertexStateDesc(): GPUVertexState {
    // 🔣 Input Assembly
    const positionAttribDesc: GPUVertexAttribute = {
      shaderLocation: 0, // [[attribute(0)]]
      offset: 0,
      format: "float32x3",
    };
    const colorAttribDesc: GPUVertexAttribute = {
      shaderLocation: 1, // [[attribute(1)]]
      offset: 0,
      format: "float32x3",
    };
    const positionBufferDesc: GPUVertexBufferLayout = {
      attributes: [positionAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: "vertex",
    };
    const colorBufferDesc: GPUVertexBufferLayout = {
      attributes: [colorAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: "vertex",
    };

    const vertexState: GPUVertexState = {
      buffers: [positionBufferDesc, colorBufferDesc],
      module: this.shaderModule,
      entryPoint: this.vsEntry,
    };
    return vertexState;
  }

  // 🖍️ Shader Modules
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

class MeshShader extends Shader {
  constructor() {
    super("triangle_shader_wgsl_src");
  }

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...
    // Note: You could include these binaries as variables in your
    // javascript source.

    await this.loadModules();

    // Bind Group Layout
    const uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
      ],
    });
    this.bindGroupLayouts = [uniformBindGroupLayout];
    this.pipelineLayout = this.device.createPipelineLayout({
      // order here set number from the glsl
      bindGroupLayouts: this.bindGroupLayouts,
    });
    console.log("pipeline and uniform group layouts created");
  }

  // this (and the underlying uniform buffer) is per-thing being drawn with this shader.
  // after this is created once per object, you can just update the uniform buffer.
  // if it's a texture binding that changes, then you have to re-create a bind group
  // if it needs to e.g. ping-pong then you can just create 2 separate bind groups, one for each texture.
  public createShaderBindGroup(uniformBuffer: GPUBuffer): GPUBindGroup {
    //  Bind Group
    // This would be used when encoding commands
    return this.device.createBindGroup({
      layout: this.bindGroupLayouts[0],
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
      ],
    });
  }

  // TODO customize this for each shader (mesh, volume)
  getVertexStateDesc(): GPUVertexState {
    // 🔣 Input Assembly
    const positionAttribDesc: GPUVertexAttribute = {
      shaderLocation: 0, // [[attribute(0)]]
      offset: 0,
      format: "float32x3",
    };
    const colorAttribDesc: GPUVertexAttribute = {
      shaderLocation: 1, // [[attribute(1)]]
      offset: 0,
      format: "float32x3",
    };
    const positionBufferDesc: GPUVertexBufferLayout = {
      attributes: [positionAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: "vertex",
    };
    const colorBufferDesc: GPUVertexBufferLayout = {
      attributes: [colorAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: "vertex",
    };

    const vertexState: GPUVertexState = {
      buffers: [positionBufferDesc, colorBufferDesc],
      module: this.shaderModule,
      entryPoint: this.vsEntry,
    };
    return vertexState;
  }

  // 🖍️ Shader Modules
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

class VolumeShader extends Shader {
  constructor() {
    super(volume_wgsl as unknown as string);
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
    const uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" as GPUBufferBindingType },
        },
        {
          binding: 1, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "non-filtering" as GPUSamplerBindingType },
        },
        {
          binding: 2, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "unfilterable-float" as GPUTextureSampleType,
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
    this.bindGroupLayouts = [uniformBindGroupLayout];
    this.pipelineLayout = this.device.createPipelineLayout({
      // order here set number from the glsl
      bindGroupLayouts: this.bindGroupLayouts,
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

export { Shader, MeshShader, VolumeShader };
