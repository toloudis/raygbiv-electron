import { mypad } from "./bufferUtil";

// consider using readFileSync here to skip the fetch step
import * as triangle_frag_spv from "./shaders/triangle.frag.spv";
import * as triangle_vert_spv from "./shaders/triangle.vert.spv";
import * as volume_frag_spv from "./shaders/volume.frag.spv";
import * as volume_vert_spv from "./shaders/volume.vert.spv";

class Shader {
  protected vspath = "";
  protected fspath = "";
  protected vertModule: GPUShaderModule = null;
  protected fragModule: GPUShaderModule = null;
  protected device: GPUDevice = null;

  protected uniformBindGroupLayout: GPUBindGroupLayout = null;
  protected pipelineLayout: GPUPipelineLayout = null;

  // Helper function for creating GPUShaderModule(s) out of SPIR-V files
  private loadShader(shaderPath: string) {
    return fetch(new Request(shaderPath), {
      method: "GET",
      mode: "cors",
    }).then((res) => res.arrayBuffer().then((arr) => new Uint32Array(arr)));
  }

  constructor(vspath: string, fspath: string) {
    this.vspath = vspath;
    this.fspath = fspath;
  }

  protected async loadModules() {
    const vsmDesc: GPUShaderModuleDescriptor = {
      code: await this.loadShader(this.vspath),
    };
    this.vertModule = this.device.createShaderModule(vsmDesc);

    const fsmDesc: GPUShaderModuleDescriptor = {
      code: await this.loadShader(this.fspath),
    };
    this.fragModule = this.device.createShaderModule(fsmDesc);

    console.log("shader modules created");
  }

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...
    // Note: You could include these binaries as variables in your
    // javascript source.

    await this.loadModules();
  }

  public createUniformBuffer(uniformData: Float32Array): GPUBuffer {
    // Helper function for creating GPUBuffer(s) out of Typed Arrays

    const createBuffer = (arr: Float32Array | Uint16Array, usage: number) => {
      const paddedBufferSize = mypad(arr.byteLength);
      const desc = {
        size: paddedBufferSize,
        usage,
        mappedAtCreation: true,
      };
      console.log("create mesh buffer " + arr.byteLength);
      // @ts-ignore TS2339
      const buffer = this.device.createBuffer(desc);
      const bufferMapped = buffer.getMappedRange(0, paddedBufferSize);

      const writeArray =
        arr instanceof Uint16Array
          ? new Uint16Array(bufferMapped)
          : new Float32Array(bufferMapped);
      writeArray.set(arr);
      buffer.unmap();
      return buffer;
    };

    // stick this data into a gpu buffer
    const uniformBuffer: GPUBuffer = createBuffer(
      uniformData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    );

    return uniformBuffer;
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
      module: this.vertModule,
      entryPoint: "main",
    };
    return vertexState;
  }

  // 🖍️ Shader Modules
  getVertexStage(): GPUProgrammableStage {
    return { module: this.vertModule, entryPoint: "main" };
  }

  getFragmentStage(): GPUProgrammableStage {
    return {
      module: this.fragModule,
      entryPoint: "main",
    };
  }

  getPipelineLayout(): GPUPipelineLayout {
    return this.pipelineLayout;
  }
}

class MeshShader extends Shader {
  constructor() {
    super(
      triangle_vert_spv as unknown as string,
      triangle_frag_spv as unknown as string
    );
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
      ],
    });
    this.pipelineLayout = this.device.createPipelineLayout({
      // order here set number from the glsl
      bindGroupLayouts: [this.uniformBindGroupLayout],
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
      layout: this.uniformBindGroupLayout,
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
      module: this.vertModule,
      entryPoint: "main",
    };
    return vertexState;
  }

  // 🖍️ Shader Modules
  getVertexStage(): GPUProgrammableStage {
    return { module: this.vertModule, entryPoint: "main" };
  }

  getFragmentStage(): GPUProgrammableStage {
    return {
      module: this.fragModule,
      entryPoint: "main",
    };
  }

  getPipelineLayout(): GPUPipelineLayout {
    return this.pipelineLayout;
  }
}

class VolumeShader extends Shader {
  constructor() {
    super(
      volume_vert_spv as unknown as string,
      volume_frag_spv as unknown as string
    );
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
      module: this.vertModule,
      entryPoint: "main",
    };
    return vertexState;
  }

  // 🖍️ Shader Modules
  getVertexStage(): GPUProgrammableStage {
    return { module: this.vertModule, entryPoint: "main" };
  }

  getFragmentStage(): GPUProgrammableStage {
    return {
      module: this.fragModule,
      entryPoint: "main",
    };
  }

  getPipelineLayout(): GPUPipelineLayout {
    return this.pipelineLayout;
  }
}

export { Shader, MeshShader, VolumeShader };
