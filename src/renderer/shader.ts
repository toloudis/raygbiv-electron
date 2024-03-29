export default class Shader {
  private vspath = "";
  private fspath = "";
  private vertModule: GPUShaderModule = null;
  private fragModule: GPUShaderModule = null;
  private device: GPUDevice = null;
  private uniformBindGroupLayout: GPUBindGroupLayout = null;
  private pipelineLayout: GPUPipelineLayout = null;

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

  public async load(device: GPUDevice): Promise<void> {
    this.device = device;
    // inside an async function...
    // Note: You could include these binaries as variables in your
    // javascript source.

    const vsmDesc: GPUShaderModuleDescriptor = {
      code: await this.loadShader(this.vspath),
    };
    this.vertModule = device.createShaderModule(vsmDesc);

    const fsmDesc: GPUShaderModuleDescriptor = {
      code: await this.loadShader(this.fspath),
    };
    this.fragModule = device.createShaderModule(fsmDesc);

    console.log("shader modules created");

    // Bind Group Layout
    this.uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // binding 0 for set 0 in the VS glsl is a uniform buffer
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: "uniform" as GPUBufferBindingType,
          },
        },
      ],
    });
    this.pipelineLayout = this.device.createPipelineLayout({
      // order here set number from the glsl
      bindGroupLayouts: [this.uniformBindGroupLayout],
    });
    console.log("pipeline and uniform group layouts created");
  }

  public createShaderBindGroup(uniformBuffer: GPUBuffer): GPUBindGroup {
    //  Bind Group
    // ✍ This would be used when encoding commands
    return this.device.createBindGroup({
      layout: this.uniformBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
          },
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
      ...this.getVertexStage(),
      buffers: [positionBufferDesc, colorBufferDesc],
    };
    return vertexState;
  }

  // Shader Modules
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
