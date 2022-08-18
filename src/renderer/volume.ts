import { mat4 } from "gl-matrix";

import { createGPUBuffer } from "./bufferUtil";
import { createCube } from "./geometries";
import { PreFuseShader } from "./preFuseShader";
import { FuseShader } from "./fuseShader";
import Histogram from "./Histogram";

export class ChannelState {
  rgb: [number, number, number];
  enabled: boolean;
  imin: number;
  imax: number;

  constructor(
    enabled: boolean = false,
    rgb: [number, number, number] = [0, 0, 0],
    imin: number = 0,
    imax: number = 1
  ) {
    this.rgb = rgb;
    this.enabled = enabled;
    this.imin = imin;
    this.imax = imax;
  }
}

export class VolumeData {
  // for now, we want this to be an 8-bit 3d array at all times
  // the input data must be converted as such (?)
  //should be ZYX 3d array of uint8; len(data.shape) == 3
  public data: Uint8Array;
  // ZYX
  public shape: [number, number, number];
  public histogram: Histogram;
  public texture: GPUTexture;
  public textureView: GPUTextureView;

  constructor(
    arraydata: Uint8Array,
    shape: [number, number, number],
    device: GPUDevice
  ) {
    this.data = arraydata;
    this.histogram = new Histogram(arraydata);
    this.shape = shape; // ZYX
    // assert shape[0]*shape[1]*shape[2] == arraydata.length
    this.texture = this.make_texture(device);
    this.textureView = this.texture.createView();
  }

  make_texture(device: GPUDevice): GPUTexture {
    const texture_data = this.data;
    const texture_size = this.shape;

    // Create texture, and upload data
    const texture = device.createTexture({
      size: {
        width: texture_size[2],
        height: texture_size[1],
        depthOrArrayLayers: texture_size[0],
      },
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      dimension: "3d",
      format: "r8unorm",
      mipLevelCount: 1,
      sampleCount: 1,
      label: "volume channel 3d r8unorm texture",
    });
    device.queue.writeTexture(
      { texture: texture, origin: [0, 0, 0], mipLevel: 0 },
      texture_data,
      { bytesPerRow: texture_size[2], rowsPerImage: texture_size[1] },
      [texture_size[2], texture_size[1], texture_size[0]]
    );
    return texture;
  }
}

// export class Volume {
//   private positionBuffer: GPUBuffer = null;
//   private indexBuffer: GPUBuffer = null;
//   private volumeBuffer: GPUTexture = null;
//   private volumeBufferView: GPUTextureView = null;
//   // in pixels
//   private dims: [number, number, number] = [0, 0, 0];
//   // in world units
//   private physicalDims: [number, number, number] = [0, 0, 0];
//   private tiling: [number, number, number] = [0, 0, 0];

//   constructor(
//     device: GPUDevice,
//     volumedata: Uint8Array,
//     x: number,
//     y: number,
//     z: number,
//     px: number,
//     py: number,
//     pz: number
//   ) {
//     this.dims = [x, y, z];
//     this.physicalDims = [px, py, pz];

//     this.tiling = [1, 1, 1];
//     this.volumeBuffer = createVolumeTexture(
//       device,
//       volumedata,
//       x,
//       y,
//       z,
//       GPUTextureUsage.TEXTURE_BINDING
//     );
//     // this.tiling = computeTiling(x, y, z);
//     // this.volumeBuffer = createTiledVolumeTexture(
//     //   device,
//     //   volumedata,
//     //   x,
//     //   y,
//     //   z,
//     //   this.tiling[0],
//     //   this.tiling[1],
//     //   GPUTextureUsage.TEXTURE_BINDING
//     // );
//     this.volumeBufferView = this.volumeBuffer.createView();

//     // unit cube
//     const cubedata = createCube({ dimensions: [px, py, pz] });

//     this.positionBuffer = createGPUBuffer(
//       cubedata.positions.buffer,
//       GPUBufferUsage.VERTEX,
//       device
//     );
//     this.indexBuffer = createGPUBuffer(
//       cubedata.indices.buffer,
//       GPUBufferUsage.INDEX,
//       device
//     );
//   }

//   getPositionBuffer(): GPUBuffer {
//     return this.positionBuffer;
//   }
//   getIndexBuffer(): GPUBuffer {
//     return this.indexBuffer;
//   }
//   getIndexFormat(): GPUIndexFormat {
//     return "uint16";
//   }

//   getVolumeBufferView(): GPUTextureView {
//     return this.volumeBufferView;
//   }

//   getDims(): [number, number, number] {
//     // TODO return copy
//     return this.dims;
//   }
//   getPhysicalDims(): [number, number, number] {
//     // TODO return copy
//     return this.physicalDims;
//   }
//   getTiling(): [number, number, number] {
//     return this.tiling;
//   }
// }

function createVolumeTexture(
  device: GPUDevice,
  data: Uint8Array,
  x: number,
  y: number,
  z: number,
  usage: GPUTextureUsageFlags
): GPUTexture {
  // must be multiple of 4 bytes.
  // if not, then we need to copy into a new buffer with the proper stride
  // for now, assume
  const bytesPerRow = x;
  if (bytesPerRow % 256 > 0) {
    console.error("Volume texture needs row stride of multiple of 256");
  }

  const texture = device.createTexture({
    size: {
      width: x,
      height: y,
      depthOrArrayLayers: z,
    },
    dimension: "3d",
    format: "r8unorm",
    usage: GPUTextureUsage.COPY_DST | usage,
  });

  const textureDataBuffer = createGPUBuffer(
    data.buffer,
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    device
  );

  const commandEncoder = device.createCommandEncoder({});
  commandEncoder.copyBufferToTexture(
    {
      buffer: textureDataBuffer,
      bytesPerRow,
      rowsPerImage: y,
    },
    {
      texture: texture,
    },
    {
      width: x,
      height: y,
      depthOrArrayLayers: z,
    }
  );

  device.queue.submit([commandEncoder.finish()]);
  textureDataBuffer.destroy();

  return texture;
}

function computeTiling(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  // compute rows and cols and atlas width and ht, given tw and th
  let nextrows = 1;
  let nextcols = z;
  let ratio = (nextcols * x) / (nextrows * y);
  let nrows = nextrows;
  let ncols = nextcols;
  while (ratio > 1) {
    nrows = nextrows;
    ncols = nextcols;
    nextcols -= 1;
    nextrows = Math.ceil(z / nextcols);
    ratio = (nextcols * x) / (nextrows * y);
  }
  const atlaswidth = ncols * x;
  const atlasheight = nrows * y;
  return [ncols, nrows, 1];
}

function createTiledVolumeTexture(
  device: GPUDevice,
  data: Uint8Array,
  x: number,
  y: number,
  z: number,
  ntilesX: number,
  ntilesY: number,
  usage: GPUTextureUsageFlags
): GPUTexture {
  const atlaswidth = ntilesX * x;
  const atlasheight = ntilesY * y;

  // must be multiple of 4 bytes.
  // if not, then we need to copy into a new buffer with the proper stride
  // for now, assume
  const bytesPerRow = atlaswidth;
  if (bytesPerRow % 256 > 0) {
    console.error("Volume texture needs row stride of multiple of 256");
  }

  const texture = device.createTexture({
    size: {
      width: atlaswidth,
      height: atlasheight,
    },
    dimension: "2d",
    format: "r8unorm",
    usage: GPUTextureUsage.COPY_DST | usage,
  });

  const textureDataBuffer = createGPUBuffer(
    data.buffer,
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    device
  );

  const commandEncoder = device.createCommandEncoder({});
  commandEncoder.copyBufferToTexture(
    {
      buffer: textureDataBuffer,
      bytesPerRow,
      rowsPerImage: atlasheight,
    },
    {
      texture: texture,
    },
    {
      width: atlaswidth,
      height: atlasheight,
    }
  );

  device.queue.submit([commandEncoder.finish()]);
  textureDataBuffer.destroy();

  return texture;
}

export class Volume {
  channels: VolumeData[];
  device: GPUDevice;
  luts: GPUBuffer[];
  lut_textures: GPUTexture[];
  // ZYX
  physical_dims: [number, number, number];
  // ZYX
  pixel_dims: [number, number, number];
  vertex_buffer: GPUBuffer;
  index_buffer: GPUBuffer;
  transform: mat4;

  // target for RGBA combination of many channels
  fused_texture: GPUTexture;
  fused_texture_temp: GPUTexture;
  fused_texture_view: GPUTextureView;
  fused_texture_temp_view: GPUTextureView;
  fuseshader: FuseShader;
  clearfuseshader: PreFuseShader;

  fuse_bind_group0_layout: GPUBindGroupLayout;
  fuse_bind_group1_layout: GPUBindGroupLayout;
  fuse_compute_pipeline: GPUComputePipeline;
  prefuse_bind_group_layout: GPUBindGroupLayout;
  prefuse_compute_pipeline: GPUComputePipeline;
  clearbind_group: GPUBindGroup;
  pingpongBindGroups: GPUBindGroup[];
  fuseChannelBindGroups: GPUBindGroup[];

  constructor(
    physical_dims: [number, number, number],
    pixel_dims: [number, number, number],
    device: GPUDevice
  ) {
    this.channels = [];
    this.luts = [];
    this.lut_textures = [];
    this.physical_dims = physical_dims;
    this.pixel_dims = pixel_dims;
    this.create_geometry(device);
    this.transform = mat4.fromScaling(mat4.create(), [
      physical_dims[2],
      physical_dims[1],
      physical_dims[0],
    ]);
    this.device = device;
  }

  getDims(): [number, number, number] {
    return this.pixel_dims;
  }
  getPhysicalDims(): [number, number, number] {
    return this.physical_dims;
  }
  getChannel(index: number): VolumeData {
    return this.channels[index];
  }

  create_geometry(device: GPUDevice) {
    const cubedata = createCube({
      dimensions: [
        this.physical_dims[2],
        this.physical_dims[1],
        this.physical_dims[0],
      ],
    });

    this.vertex_buffer = createGPUBuffer(
      cubedata.positions.buffer,
      GPUBufferUsage.VERTEX,
      device
    );
    this.index_buffer = createGPUBuffer(
      cubedata.indices.buffer,
      GPUBufferUsage.INDEX,
      device
    );
  }

  async prepare_fuse() {
    this.fuseshader = new FuseShader();
    await this.fuseshader.load(this.device);
    this.clearfuseshader = new PreFuseShader();
    await this.clearfuseshader.load(this.device);
    this.fused_texture = this.device.createTexture({
      size: [this.pixel_dims[2], this.pixel_dims[1], this.pixel_dims[0]],
      dimension: "3d",
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC,
      label: "volume fused texture rgba8unorm ping",
    });
    this.fused_texture_temp = this.device.createTexture({
      size: [this.pixel_dims[2], this.pixel_dims[1], this.pixel_dims[0]],
      dimension: "3d",
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC,
      label: "volume fused texture rgba8unorm pong",
    });
    this.fused_texture_view = this.fused_texture.createView();
    this.fused_texture_temp_view = this.fused_texture_temp.createView();

    this.fuse_bind_group0_layout = this.fuseshader.bindGroupLayouts[0];
    this.fuse_bind_group1_layout = this.fuseshader.bindGroupLayouts[1];
    this.fuse_compute_pipeline = this.fuseshader.computePipeline;

    this.prefuse_bind_group_layout = this.clearfuseshader.bindGroupLayouts[0];
    this.prefuse_compute_pipeline = this.clearfuseshader.computePipeline;

    const clearbindings: GPUBindGroupEntry[] = [
      { binding: 0, resource: this.fused_texture_view },
      { binding: 1, resource: this.fused_texture_temp_view },
    ];
    this.clearbind_group = this.device.createBindGroup({
      layout: this.prefuse_bind_group_layout,
      entries: clearbindings,
    });

    const pingpongBindings0: GPUBindGroupEntry[] = [
      { binding: 0, resource: this.fused_texture_view },
      { binding: 1, resource: this.fused_texture_temp_view },
    ];
    const pingpongBindings1: GPUBindGroupEntry[] = [
      { binding: 0, resource: this.fused_texture_temp_view },
      { binding: 1, resource: this.fused_texture_view },
    ];
    const bind_group0 = this.device.createBindGroup({
      //label: `fuse bind group0 ${i} for channel ${fusechannels[i]}`,
      layout: this.fuse_bind_group0_layout,
      entries: pingpongBindings0,
    });
    const bind_group1 = this.device.createBindGroup({
      //label: `fuse bind group0 ${i} for channel ${fusechannels[i]}`,
      layout: this.fuse_bind_group0_layout,
      entries: pingpongBindings1,
    });
    this.pingpongBindGroups = [bind_group0, bind_group1];
    this.fuseChannelBindGroups = [];
  }

  setup_channel_luts() {
    this.luts = [];
    this.lut_textures = [];
    const colors = [
      [1.0, 0.0, 0.0, 1.0],
      [0.0, 1.0, 0.0, 1.0],
      [0.0, 0.0, 1.0, 1.0],
      [1.0, 1.0, 0.0, 1.0],
      [1.0, 0.0, 1.0, 1.0],
      [0.0, 1.0, 1.0, 1.0],
      [1.0, 0.5, 0.0, 1.0],
      [0.5, 0.0, 1.0, 1.0],
      [0.0, 1.0, 0.5, 1.0],
    ];
    for (let i = 0; i < this.channels.length; ++i) {
      const random_color = colors[i % colors.length]; // list(np.random.choice(range(255), size=4) / 255.0)
      random_color[3] = 1.0;
      const lut = this.channels[i].histogram.lutGenerator_percentiles(50, 98);
      const clut = lut.lut;

      const clut_f = new Float32Array(clut.length);
      for (let j = 0; j < clut.length; ++j) {
        clut_f[j] = clut[j];
      }
      const buf = createGPUBuffer(
        clut_f,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        this.device
      );
      this.luts.push(buf);

      const texture = this.device.createTexture({
        label: "lut texture",
        size: [256, 1, 1],
        format: "rgba32float", // lut is uint8!! FIXME TODO FIX
        //        format: "rgba32float", // lut is uint8!! FIXME TODO FIX
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.device.queue.writeTexture(
        { texture: texture, origin: [0, 0, 0], mipLevel: 0 },
        clut_f,
        // write the whole clut as one row
        { bytesPerRow: clut_f.byteLength, rowsPerImage: 1 },
        [256, 1, 1]
      );
      this.lut_textures.push(texture);

      // set up fuse bind group for this channel
      const bindings1: GPUBindGroupEntry[] = [
        { binding: 0, resource: this.channels[i].textureView },
        {
          binding: 1,
          resource: {
            buffer: this.luts[i],
            offset: 0,
            size: this.luts[i].size,
          },
        },
      ];
      const bind_group1 = this.device.createBindGroup({
        label: `fuse bind group1 for channel ${i}`,
        layout: this.fuse_bind_group1_layout,
        entries: bindings1,
      });
      this.fuseChannelBindGroups.push(bind_group1);
    }
  }

  update_lut(
    device: GPUDevice,
    channel: number,
    imin: number,
    imax: number,
    rgb: [number, number, number]
  ) {
    const lut = this.channels[channel].histogram.lutGenerator_percentiles(
      50,
      98
    );
    const clut = lut.lut;
    // fill lut with rgb
    for (let i = 0; i < clut.length / 4; ++i) {
      clut[i * 4 + 0] *= rgb[0];
      clut[i * 4 + 1] *= rgb[1];
      clut[i * 4 + 2] *= rgb[2];
    }
    const clut_f = new Float32Array(clut.length);
    for (let j = 0; j < clut.length; ++j) {
      clut_f[j] = clut[j];
    }

    //this.luts[channel].map_write(clut);
    device.queue.writeBuffer(this.luts[channel], 0, clut_f);
    device.queue.writeTexture(
      {
        texture: this.lut_textures[channel],
        origin: [0, 0, 0],
        mipLevel: 0,
      },
      clut_f,
      // write the whole clut as one row
      { bytesPerRow: clut_f.byteLength, rowsPerImage: 1 },
      [256, 1, 1]
    );
  }

  fuse_channels_gpu(
    device: GPUDevice,
    command_encoder: GPUCommandEncoder,
    channel_state: ChannelState[]
  ): GPUTextureView {
    const nz = this.pixel_dims[0];
    const ny = this.pixel_dims[1];
    const nx = this.pixel_dims[2];

    const fusechannels = [];
    for (let i = 0; i < channel_state.length; ++i) {
      if (channel_state[i].enabled) {
        fusechannels.push(i);
      }
    }

    // generate the necessary bind groups for this fuse.

    const compute_pass = command_encoder.beginComputePass();

    // 1. clear
    compute_pass.setPipeline(this.prefuse_compute_pipeline);
    compute_pass.setBindGroup(0, this.clearbind_group);
    compute_pass.dispatchWorkgroups(nx, ny, nz);

    // 2. fuse all channels in fusechannels
    compute_pass.setPipeline(this.fuse_compute_pipeline);
    for (let i = 0; i < fusechannels.length; ++i) {
      compute_pass.setBindGroup(0, this.pingpongBindGroups[i % 2]);
      compute_pass.setBindGroup(1, this.fuseChannelBindGroups[fusechannels[i]]);
      compute_pass.dispatchWorkgroups(nx, ny, nz);
    }
    compute_pass.end();

    // return target of last draw
    // see bind groups above
    // TODO confirm this is correct
    if (fusechannels.length % 2 == 0) {
      return this.fused_texture_view;
    } else {
      return this.fused_texture_temp_view;
    }

    // device.queue.submit([command_encoder.finish()])

    // # optionally, for debugging!!
    // # Read the current data of the output buffers
    // # output = {}
    // # for index, info in output_infos.items():
    // #     buffer = buffers[index]
    // #     # m = buffer.read_data()  # old API
    // #     m = device.queue.read_buffer(buffer)  # slow, can also be done async
    // #     if "ctypes_array_type" in info:
    // #         output[index] = info["ctypes_array_type"].from_buffer(m)
    // #     else:
    // #         output[index] = m.cast(info["format"], shape=info["shape"])
  }
}
