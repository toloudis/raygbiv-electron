import { IGraphics, ISceneRenderer, IRenderTarget } from "./api";
import {
  createGPUBuffer,
  createGeometryBuffers,
  createUniformBuffer,
  concatArrayBuffers,
} from "./bufferUtil";
import { createQuad } from "./geometries";
import { VolumeShader } from "./ptVolumeShader";
import { TonemapShader } from "./toneMapShader";
import { PreFuseShader } from "./preFuseShader";
import { FuseShader } from "./fuseShader";
import { Volume } from "./volume";
import Scene from "./scene";
import Camera from "./camera";
import CanvasRenderTarget from "./canvasRenderTarget";

import { vec2, vec3, vec4 } from "gl-matrix";

class CameraBuffer {
  from: vec3;
  U: vec3;
  V: vec3;
  N: vec3;
  screen: vec4;
  invScreen: vec2;
  focalDistance: number;
  apertureSize: number;
  isPerspective: number;

  sizeBytes(): number {
    return this.toBuffer().byteLength;
  }
  toBuffer(): Float32Array {
    return new Float32Array([
      this.from[0],
      this.from[1],
      this.from[2],
      0,
      this.U[0],
      this.U[1],
      this.U[2],
      0,
      this.V[0],
      this.V[1],
      this.V[2],
      0,
      this.N[0],
      this.N[1],
      this.N[2],
      0,
      this.screen[0],
      this.screen[1],
      this.screen[2],
      this.screen[3],
      this.invScreen[0],
      this.invScreen[1],
      0,
      0,
      this.focalDistance,
      this.apertureSize,
      this.isPerspective,
      0,
    ]);
  }
}

class LightBuffer {
  theta: number;
  phi: number;
  width: number;
  halfWidth: number;
  height: number;
  halfHeight: number;
  distance: number;
  skyRadius: number;
  area: number;
  areaPdf: number;
  T: number;
  P: vec3;
  target: vec3;
  N: vec3;
  U: vec3;
  V: vec3;
  color: vec3;
  colorTop: vec3;
  colorMiddle: vec3;
  colorBottom: vec3;

  sizeBytes(): number {
    return this.toBuffer().byteLength;
  }
  toBuffer(): Float32Array {
    return new Float32Array([
      this.theta,
      this.phi,
      this.width,
      this.halfWidth,
      this.height,
      this.halfHeight,
      this.distance,
      this.skyRadius,
      this.area,
      this.areaPdf,
      this.T,
      0,
      this.P[0],
      this.P[1],
      this.P[2],
      0,
      this.target[0],
      this.target[1],
      this.target[2],
      0,
      this.N[0],
      this.N[1],
      this.N[2],
      0,
      this.U[0],
      this.U[1],
      this.U[2],
      0,
      this.V[0],
      this.V[1],
      this.V[2],
      0,
      this.color[0],
      this.color[1],
      this.color[2],
      0,
      this.colorTop[0],
      this.colorTop[1],
      this.colorTop[2],
      0,
      this.colorMiddle[0],
      this.colorMiddle[1],
      this.colorMiddle[2],
      0,
      this.colorBottom[0],
      this.colorBottom[1],
      this.colorBottom[2],
      0,
    ]);
  }
}

class GlobalParamsBuffer {
  gClippedAaBbMin: vec3;
  gClippedAaBbMax: vec3;
  gDensityScale: number;
  gStepSize: number;
  gStepSizeShadow: number;
  gInvAaBbSize: vec3;
  g_nChannels: number;
  gShadingType: number;
  gGradientDeltaX: vec3;
  gGradientDeltaY: vec3;
  gGradientDeltaZ: vec3;
  gInvGradientDelta: number;
  gGradientFactor: number;
  uShowLights: number;

  sizeBytes(): number {
    return this.toBuffer().byteLength;
  }
  toBuffer(): Float32Array {
    return new Float32Array([
      this.gClippedAaBbMin[0],
      this.gClippedAaBbMin[1],
      this.gClippedAaBbMin[2],
      0,
      this.gClippedAaBbMax[0],
      this.gClippedAaBbMax[1],
      this.gClippedAaBbMax[2],
      this.gDensityScale,
      this.gStepSize,
      this.gStepSizeShadow,
      0,
      0,
      this.gInvAaBbSize[0],
      this.gInvAaBbSize[1],
      this.gInvAaBbSize[2],
      this.g_nChannels,
      this.gShadingType,
      0,
      0,
      0,
      this.gGradientDeltaX[0],
      this.gGradientDeltaX[1],
      this.gGradientDeltaX[2],
      0,
      this.gGradientDeltaY[0],
      this.gGradientDeltaY[1],
      this.gGradientDeltaY[2],
      0,
      this.gGradientDeltaZ[0],
      this.gGradientDeltaZ[1],
      this.gGradientDeltaZ[2],
      this.gInvGradientDelta,
      this.gGradientFactor,
      this.uShowLights,
      0,
      0,
    ]);
  }
}

class ChannelsBuffer {
  g_intensityMax: vec4;
  g_intensityMin: vec4;
  g_opacity: vec4;
  g_emissive: [vec4, vec4, vec4, vec4];
  g_diffuse: [vec4, vec4, vec4, vec4];
  g_specular: [vec4, vec4, vec4, vec4];
  g_roughness: vec4;

  sizeBytes(): number {
    return this.toBuffer().byteLength;
  }
  toBuffer(): Float32Array {
    return new Float32Array([
      this.g_intensityMax[0],
      this.g_intensityMax[1],
      this.g_intensityMax[2],
      this.g_intensityMax[3],
      this.g_intensityMin[0],
      this.g_intensityMin[1],
      this.g_intensityMin[2],
      this.g_intensityMin[3],
      this.g_opacity[0],
      this.g_opacity[1],
      this.g_opacity[2],
      this.g_opacity[3],
      this.g_emissive[0][0],
      this.g_emissive[0][1],
      this.g_emissive[0][2],
      this.g_emissive[0][3],
      this.g_emissive[1][0],
      this.g_emissive[1][1],
      this.g_emissive[1][2],
      this.g_emissive[1][3],
      this.g_emissive[2][0],
      this.g_emissive[2][1],
      this.g_emissive[2][2],
      this.g_emissive[2][3],
      this.g_emissive[3][0],
      this.g_emissive[3][1],
      this.g_emissive[3][2],
      this.g_emissive[3][3],
      this.g_diffuse[0][0],
      this.g_diffuse[0][1],
      this.g_diffuse[0][2],
      this.g_diffuse[0][3],
      this.g_diffuse[1][0],
      this.g_diffuse[1][1],
      this.g_diffuse[1][2],
      this.g_diffuse[1][3],
      this.g_diffuse[2][0],
      this.g_diffuse[2][1],
      this.g_diffuse[2][2],
      this.g_diffuse[2][3],
      this.g_diffuse[3][0],
      this.g_diffuse[3][1],
      this.g_diffuse[3][2],
      this.g_diffuse[3][3],
      this.g_specular[0][0],
      this.g_specular[0][1],
      this.g_specular[0][2],
      this.g_specular[0][3],
      this.g_specular[1][0],
      this.g_specular[1][1],
      this.g_specular[1][2],
      this.g_specular[1][3],
      this.g_specular[2][0],
      this.g_specular[2][1],
      this.g_specular[2][2],
      this.g_specular[2][3],
      this.g_specular[3][0],
      this.g_specular[3][1],
      this.g_specular[3][2],
      this.g_specular[3][3],
      this.g_roughness[0],
      this.g_roughness[1],
      this.g_roughness[2],
      this.g_roughness[3],
    ]);
  }
}

// compositing / progressive render
class ProgressiveBuffer {
  uFrameCounter: number;
  uSampleCounter: number;
  uResolution: vec2;
  sizeBytes(): number {
    return this.toBuffer().byteLength;
  }
  toBuffer(): Float32Array {
    return new Float32Array([
      this.uFrameCounter,
      this.uSampleCounter,
      this.uResolution[0],
      this.uResolution[1],
    ]);
  }
}

class ExposureBuffer {
  exposure: number;
  sizeBytes(): number {
    return this.toBuffer().byteLength;
  }
  toBuffer(): Float32Array {
    return new Float32Array([this.exposure, 0, 0, 0]);
  }
}

function make_light(
  type = 1,
  theta = 0,
  phi = 3.14159265 * 0.5,
  width = 1,
  height = 1,
  distance = 10,
  sky_radius = 1000,
  target = vec3.fromValues(0, 0, 0)
): LightBuffer {
  const p = vec3.fromValues(
    distance * Math.sin(phi) * Math.sin(theta),
    distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.cos(phi)
  );
  let area = 0;
  if (type == 1) {
    target = vec3.add(target, p, vec3.fromValues(0, 0, 1.0));
    area = 4.0 * 3.14159265 * Math.pow(sky_radius, 2.0);
  } else {
    area = width * height;
  }

  // Compute orthogonal basis frame
  let N = vec3.fromValues(0, 0, 0);
  let U = vec3.fromValues(0, 0, 0);
  let V = vec3.fromValues(0, 0, 0);
  N = vec3.sub(N, target, p);
  N = vec3.normalize(N, N);
  // if N and "up" are parallel, then just choose a different "up"
  if (N[1] == 1.0 || N[1] == -1.0) {
    U = vec3.cross(U, N, vec3.fromValues(1.0, 0.0, 0.0));
    U = vec3.normalize(U, U);
  } else {
    // standard "up" vector
    U = vec3.cross(U, N, vec3.fromValues(0.0, 1.0, 0.0));
    U = vec3.normalize(U, U);
  }
  V = vec3.cross(V, N, U);
  V = vec3.normalize(V, V);

  const light = new LightBuffer();
  light.theta = theta;
  light.phi = phi;
  light.width = width;
  light.halfWidth = 0.5 * width;
  light.height = 1.0;
  light.halfHeight = 0.5 * height;
  light.distance = distance;
  light.skyRadius = sky_radius;
  light.P = p;
  light.target = target;
  light.N = N;
  light.U = U;
  light.V = V;
  light.area = area;
  light.areaPdf = 1.0 / area;
  light.color = vec3.fromValues(1.0, 1.0, 1.0);
  light.colorTop = vec3.fromValues(1.0, 1.0, 1.0);
  light.colorMiddle = vec3.fromValues(1.0, 1.0, 1.0);
  light.colorBottom = vec3.fromValues(1.0, 1.0, 1.0);
  light.T = type;
  return light;
  // lightdata["colorIntensity"] = 1.0
  // lightdata["colorTopIntensity"] = 1.0
  // lightdata["colorMiddleIntensity"] = 1.0
  // lightdata["colorBottomIntensity"] = 1.0
}

class Renderer implements ISceneRenderer {
  device: GPUDevice;
  size: [number, number];
  volume: Volume;
  volume_texture: GPUTexture;
  volume_texture_view: GPUTextureView;
  lut_textures: GPUTexture;
  lut_textures_view: GPUTextureView;
  quad_vbuf: GPUBuffer;
  quad_ibuf: GPUBuffer;
  tonemap_shader: TonemapShader;
  tonemap_pipeline: GPURenderPipeline;
  tonemap_bind_group: GPUBindGroup;
  pathtrace_shader: VolumeShader;
  path_trace_pipeline: GPURenderPipeline;
  path_trace_bind_group: GPUBindGroup;
  path_trace_target: GPUTexture;
  path_trace_target_view: GPUTextureView;
  screen_target: GPUTexture;
  screen_target_view: GPUTextureView;
  simple_linear_sampler: GPUSampler;
  nearest_sampler: GPUSampler;

  cameradata: CameraBuffer;
  camera_buffer: GPUBuffer;
  camera_dirty: boolean;
  channelsdata: ChannelsBuffer;
  channels_buffer: GPUBuffer;
  channels_dirty: boolean;
  compositedata: ProgressiveBuffer;
  composite_buffer: GPUBuffer;
  light_buffer: GPUBuffer;
  lightdata0: LightBuffer;
  lightdata1: LightBuffer;
  lights_dirty: boolean;
  renderparams_buffer: GPUBuffer;
  renderparams: GlobalParamsBuffer;
  renderparams_dirty: boolean;
  exposure_buffer: GPUBuffer;
  exposureparams: ExposureBuffer;
  exposure_dirty: boolean;

  constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    size: [number, number]
  ) {
    this.device = device;
    this.size = size;
    this.volume = undefined;

    // the quad geometry for drawing render passes
    const quad_data = createQuad();
    const quadBufs = createGeometryBuffers(
      quad_data.positions,
      quad_data.indices,
      device
    );
    this.quad_vbuf = quadBufs.vertexBuffer;
    this.quad_ibuf = quadBufs.indexBuffer;

    // the render target texture for path tracing
    this.path_trace_target = undefined;
    this.path_trace_target_view = undefined;

    // the render target texture for compositing
    this.screen_target = undefined;
    this.screen_target_view = undefined;

    // sample the volume texture with linear filtering
    this.simple_linear_sampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });

    // we will sample per-pixel for composite purposes (TODO FIXME do we need a sampler if we just do texture loads???)
    this.nearest_sampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "nearest",
      minFilter: "nearest",
    });

    // data for uniform buffers for pathtrace
    this.cameradata = new CameraBuffer();
    this.channelsdata = new ChannelsBuffer();
    this.compositedata = new ProgressiveBuffer();
    this.lightdata0 = make_light(
      0,
      0,
      3.14159265 * 0.5,
      1,
      1,
      10,
      1000,
      vec3.fromValues(0, 0, 0)
    );
    this.lightdata1 = make_light(
      1,
      0,
      3.14159265 * 0.5,
      1,
      1,
      10,
      1000,
      vec3.fromValues(0, 0, 0)
    );
    this.renderparams = new GlobalParamsBuffer();

    this.exposureparams = new ExposureBuffer();
    this.exposureparams.exposure = this.exposure_from_slider(0.75);

    // the bind group will bind all these exact buffers. we won't be changing the buffer objects themselves apart from map writes
    this.camera_buffer = createUniformBuffer(
      this.cameradata.toBuffer(),
      device
    );
    this.channels_buffer = createUniformBuffer(
      this.channelsdata.toBuffer(),
      device
    );
    this.composite_buffer = createUniformBuffer(
      this.compositedata.toBuffer(),
      device
    );
    // x2 ?? how to pack the light data as array?
    this.light_buffer = createUniformBuffer(this.lightdata0.toBuffer(), device);
    this.light_buffer = createUniformBuffer(
      concatArrayBuffers(
        this.lightdata0.toBuffer(),
        this.lightdata1.toBuffer()
      ),
      device
    );
    this.renderparams_buffer = createUniformBuffer(
      this.renderparams.toBuffer(),
      device
    );
    this.exposure_buffer = createUniformBuffer(
      this.exposureparams.toBuffer(),
      device
    );

    this.lights_dirty = true;
    this.renderparams_dirty = true;
    this.camera_dirty = true;
    this.channels_dirty = true;
    this.exposure_dirty = true;

    const lutTextureDesc: GPUTextureDescriptor = {
      size: {
        width: 256,
        height: 4,
      },
      label: "lut texture 4ch",
      // arrayLayerCount: 1,
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: "2d",
      format: "rgba32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    };

    this.lut_textures = this.device.createTexture(lutTextureDesc);
    this.lut_textures_view = this.lut_textures.createView({
      label: "lut texture view 4ch",
    });

    this.do_resize(size[0], size[1]);
  }

  async initPostCtor(): Promise<void> {
    // the tonemapping shader
    this.tonemap_shader = new TonemapShader();
    await this.tonemap_shader.load(this.device);

    const format = navigator.gpu.getPreferredCanvasFormat();
    this.tonemap_pipeline = this.setuptonemappipeline(format);

    // the path tracing shader
    this.pathtrace_shader = new VolumeShader();
    await this.pathtrace_shader.load(this.device);
    this.path_trace_pipeline = this.setupvolpipeline();
  }

  exposure_from_slider(e: number): number {
    // 1.0 causes division by zero.
    if (e > 0.99999) {
      e = 0.99999;
    }
    return 1.0 / (1.0 - e) - 1.0;
  }

  setuptonemapbindgroup(): GPUBindGroup {
    const bind_group0_entries: GPUBindGroupEntry[] = [
      {
        binding: 0,
        resource: {
          buffer: this.exposure_buffer,
          offset: 0,
          size: this.exposure_buffer.size,
        },
      },
      { binding: 1, resource: this.simple_linear_sampler },
      { binding: 2, resource: this.screen_target_view },
    ];
    // Create the wgpu binding objects
    this.tonemap_bind_group = this.device.createBindGroup({
      layout: this.tonemap_shader.bindGroupLayouts[0],
      entries: bind_group0_entries,
    });
    return this.tonemap_bind_group;
  }

  setupvolbindgroup(): GPUBindGroup {
    // build bind group
    // this needs to be deferred because volume_texture is not yet set
    const bind_group0_entries: GPUBindGroupEntry[] = [
      {
        binding: 0,
        resource: {
          buffer: this.camera_buffer,
          offset: 0,
          size: this.camera_buffer.size,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: this.light_buffer,
          offset: 0,
          size: this.light_buffer.size,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: this.renderparams_buffer,
          offset: 0,
          size: this.renderparams_buffer.size,
        },
      },
      {
        binding: 3,
        resource: {
          buffer: this.channels_buffer,
          offset: 0,
          size: this.channels_buffer.size,
        },
      },
      {
        binding: 4,
        resource: {
          buffer: this.composite_buffer,
          offset: 0,
          size: this.composite_buffer.size,
        },
      },
      { binding: 5, resource: this.simple_linear_sampler },
      // volume texture changes whenever we have a new volume
      { binding: 6, resource: this.volume_texture_view },
      { binding: 7, resource: this.nearest_sampler },
      { binding: 8, resource: this.lut_textures_view },
      // note that screen_target_view changes on resize
      { binding: 9, resource: this.screen_target_view },
    ];
    // Create the wgpu binding objects
    this.path_trace_bind_group = this.device.createBindGroup({
      layout: this.pathtrace_shader.bindGroupLayouts[0],
      entries: bind_group0_entries,
    });
    return this.path_trace_bind_group;
  }

  setuptonemappipeline(output_format: GPUTextureFormat): GPURenderPipeline {
    const render_pipeline = this.device.createRenderPipeline({
      layout: this.tonemap_shader.getPipelineLayout(),
      vertex: this.tonemap_shader.vertexState,
      // we are drawing a fullscreen quad
      primitive: {
        topology: "triangle-list",
        frontFace: "ccw",
        cullMode: "none",
      },
      //depthStencil:None,
      multisample: {
        count: 1,
        mask: 0xffffffff,
        alphaToCoverageEnabled: false,
      },
      fragment: {
        module: this.tonemap_shader.shaderModule,
        entryPoint: "main_fs",
        targets: [{ format: output_format }],
      },
    });
    return render_pipeline;
  }

  setupvolpipeline(): GPURenderPipeline {
    const render_pipeline = this.device.createRenderPipeline({
      layout: this.pathtrace_shader.getPipelineLayout(),
      vertex: this.pathtrace_shader.vertexState,
      // we are drawing a fullscreen quad
      primitive: {
        topology: "triangle-list",
        frontFace: "ccw",
        cullMode: "none",
      },
      //depthStencil:None,
      multisample: {
        count: 1,
        mask: 0xffffffff,
        alphaToCoverageEnabled: false,
      },
      fragment: {
        module: this.pathtrace_shader.shaderModule,
        entryPoint: "main_fs",
        targets: [{ format: "rgba32float" as GPUTextureFormat }],
      },
    });
    return render_pipeline;
  }

  add_volume(v: Volume) {
    //##########################
    // TODO clean up resources for previous volume? uniform buffer(s)? vol_bind_group?
    //##########################

    this.volume = v;
    // make a 4 channel volume texture to hold the data for pathtrace
    // note still 8bpp
    this.volume_texture = this.device.createTexture({
      size: {
        width: this.volume.getDims()[2],
        height: this.volume.getDims()[1],
        depthOrArrayLayers: this.volume.getDims()[0],
      },
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      dimension: "3d",
      format: "rgba8unorm",
      mipLevelCount: 1,
      sampleCount: 1,
      label: "volume_texture",
    });
    this.volume_texture_view = this.volume_texture.createView();
    this.setupvolbindgroup();
    this.updaterenderparams();
  }

  updaterenderparams() {
    const sx = this.volume.getDims()[2];
    const sy = this.volume.getDims()[1];
    const sz = this.volume.getDims()[0];

    const nstepsize = 1.0;
    const nshadowstepsize = 1.0;
    const gradientDelta = 1.0 / Math.max(sx, Math.max(sy, sz));
    // can this be a per-x,y,z value?
    this.renderparams.gInvGradientDelta = 1.0 / gradientDelta;
    this.renderparams.gGradientDeltaX = vec3.fromValues(gradientDelta, 0, 0);
    this.renderparams.gGradientDeltaY = vec3.fromValues(0, gradientDelta, 0);
    this.renderparams.gGradientDeltaZ = vec3.fromValues(0, 0, gradientDelta);
    this.renderparams.gGradientFactor = 0.5;
    this.renderparams.gStepSize = gradientDelta * nstepsize;
    this.renderparams.gStepSizeShadow = gradientDelta * nshadowstepsize;
    // bounds will go from 0 to physicalSize
    this.renderparams.gInvAaBbSize = vec3.fromValues(
      1.0 / this.volume.getPhysicalDims()[2],
      1.0 / this.volume.getPhysicalDims()[1],
      1.0 / this.volume.getPhysicalDims()[0]
    );
    const xmin = 0;
    const xmax = 1;
    const ymin = 0;
    const ymax = 1;
    const zmin = 0;
    const zmax = 1;
    // centered on 0,0,0
    this.renderparams.gClippedAaBbMin = vec3.fromValues(
      xmin * this.volume.getPhysicalDims()[2] -
        0.5 * this.volume.getPhysicalDims()[2],
      ymin * this.volume.getPhysicalDims()[1] -
        0.5 * this.volume.getPhysicalDims()[1],
      zmin * this.volume.getPhysicalDims()[0] -
        0.5 * this.volume.getPhysicalDims()[0]
    );
    this.renderparams.gClippedAaBbMax = vec3.fromValues(
      xmax * this.volume.getPhysicalDims()[2] -
        0.5 * this.volume.getPhysicalDims()[2],
      ymax * this.volume.getPhysicalDims()[1] -
        0.5 * this.volume.getPhysicalDims()[1],
      zmax * this.volume.getPhysicalDims()[0] -
        0.5 * this.volume.getPhysicalDims()[0]
    );

    this.renderparams.gDensityScale = 30.5;
    this.renderparams.g_nChannels = 4;
    this.renderparams.gShadingType = 0;

    this.renderparams_dirty = true;
  }

  update_camera(device: GPUDevice, cam: Camera, s: Scene) {
    // TODO use scene?
    const physical_dims = this.volume.getPhysicalDims();
    //const physical_dims = s.volumes[0].volume.getPhysicalDims();

    const w = this.compositedata.uResolution[0];
    const h = this.compositedata.uResolution[1];

    // note that cam defaults to point at the origin
    // volume is centered at 0,0,0 and has dimensions of physical_dims

    // we want to put these camera params in the space of the volume

    let mydir = vec3.fromValues(0, 0, 0);
    mydir = vec3.sub(mydir, cam.getTarget(), cam.getPosition());
    // mydir = glm.vec3(cam.get_position() - cam.get_target())
    const myup = vec3.clone(cam.getUp());
    // don't rotate this vector.  we are using translation as the pivot point of the object, and THEN rotating.
    // note this needs to be relative to the volume center which must be shifted to 0,0,0
    // i.e. the camera data needs to be in the volume's object space
    const mypos = vec3.clone(cam.getPosition());

    // // apply volume translation and rotation:
    // // rotate myup, mypos, mydir
    // m = glm.mat4.makeRotationFromQuaternion(new Quaternion().setFromEuler(this.rotation).invert());
    // mypos.sub(this.translation);
    // mypos.applyMatrix4(m);
    // myup.applyMatrix4(m);
    // mydir.applyMatrix4(m);

    let N = vec3.fromValues(0, 0, 0);
    let U = vec3.fromValues(0, 0, 0);
    let V = vec3.fromValues(0, 0, 0);
    N = vec3.normalize(N, mydir);
    U = vec3.normalize(U, vec3.cross(U, N, myup));
    V = vec3.normalize(V, vec3.cross(V, U, N));

    // the choice of y = scale/aspect or x = scale*aspect is made here to match up with the other raymarch volume
    const ortho_scale = 1.0;
    const fScale = cam.isOrthographicCamera
      ? ortho_scale
      : Math.tan(0.5 * cam.getFov());
    const screen = vec4.fromValues(
      -fScale * cam.getAspect(),
      fScale * cam.getAspect(),
      // the "0" Y pixel will be at +Scale.
      fScale,
      -fScale
    );

    this.cameradata.isPerspective = cam.isPerspectiveCamera ? 1 : 0;
    this.cameradata.from = mypos;
    this.cameradata.N = N;
    this.cameradata.U = U;
    this.cameradata.V = V;
    this.cameradata.focalDistance = cam.getFocalDistance();
    this.cameradata.apertureSize = cam.getApertureSize();
    this.cameradata.screen = screen;
    // scr = this.pathTracingUniforms.gCamera.value.mScreen;
    this.cameradata["invScreen"] = vec2.fromValues(
      // the amount to increment for each pixel
      (screen[1] - screen[0]) / w,
      (screen[3] - screen[2]) / h
    );
    // print(this.cameradata)
    this.camera_dirty = true;
  }

  check_resize(s: [number, number]) {
    if (s[0] != this.size[0] || s[1] != this.size[1]) {
      this.do_resize(s[0], s[1]);
      this.size = s;
    }
  }

  do_resize(w: number, h: number) {
    this.path_trace_target = this.device.createTexture({
      size: [w, h, 1],
      dimension: "2d",
      format: "rgba32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC,
      label: "path_trace_target",
    });
    this.path_trace_target_view = this.path_trace_target.createView();
    this.screen_target = this.device.createTexture({
      size: [w, h, 1],
      dimension: "2d",
      format: "rgba32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      label: "screen_composite_target",
    });
    this.screen_target_view = this.screen_target.createView();

    this.compositedata["uResolution"] = vec2.fromValues(w, h);

    this.setuptonemapbindgroup();
    if (this.volume) {
      this.setupvolbindgroup();
    }
  }

  render(
    target: IRenderTarget,
    camera: Camera,
    scene: Scene,
    simulationTime: number
  ): void {
    const renderTarget = target as CanvasRenderTarget;
    const commandEncoder = this.device.createCommandEncoder();

    // render(
    //     self,
    //     device,
    //     command_encoder: wgpu.GPUCommandEncoder,
    //     target_view: wgpu.GPUTextureView,
    //     camera,
    //     scene,
    // ):
    // if target_view's size changed since last time, then resize the backing buffers here.
    this.check_resize([target.getWidth(), target.getHeight()]);

    this.combine_volume_channels(scene);
    this.update_luts(scene, commandEncoder);

    // update dirty uniformbuffers
    if (this.camera_dirty) {
      this.compositedata.uFrameCounter = 0;
      this.compositedata.uSampleCounter = 0;
      this.camera_dirty = false;
    } else {
      this.compositedata.uFrameCounter = this.compositedata.uFrameCounter + 1;
      this.compositedata.uSampleCounter = this.compositedata.uSampleCounter + 1;
    }
    const q = this.device.queue;
    q.writeBuffer(this.composite_buffer, 0, this.compositedata.toBuffer());
    //this.composite_buffer.map_write(this.compositedata);
    if (this.lights_dirty) {
      q.writeBuffer(this.light_buffer, 0, this.lightdata0.toBuffer(), 0);
      q.writeBuffer(
        this.light_buffer,
        this.lightdata0.sizeBytes(),
        this.lightdata1.toBuffer(),
        0
      );
      this.lights_dirty = false;
    }
    if (this.renderparams_dirty) {
      q.writeBuffer(this.renderparams_buffer, 0, this.renderparams.toBuffer());
      //this.renderparams_buffer.map_write(this.renderparams)
      this.renderparams_dirty = false;
    }
    if (this.camera_dirty) {
      q.writeBuffer(this.camera_buffer, 0, this.cameradata.toBuffer());
      // this.camera_buffer.map_write(this.cameradata)
      this.camera_dirty = false;
    }
    if (this.channels_dirty) {
      q.writeBuffer(this.channels_buffer, 0, this.channelsdata.toBuffer());
      // this.channels_buffer.map_write(this.channelsdata)
      this.channels_dirty = false;
    }
    if (this.exposure_dirty) {
      q.writeBuffer(this.exposure_buffer, 0, this.exposureparams.toBuffer());
      // this.exposure_buffer.map_write(this.exposureparams)
      this.exposure_dirty = false;
    }

    // // RENDERING in 3 steps

    // // STEP 1
    // // Perform PathTracing and Render(save) into pathTracingRenderTarget

    // // This is currently rendered as a fullscreen quad with no camera transform in the vertex shader!
    // // It is also composited with screenTextureRenderTarget's texture.
    // // (Read previous screenTextureRenderTarget to use as a new starting point to blend with)

    const render_pass: GPURenderPassEncoder = commandEncoder.beginRenderPass({
      label: "path_trace_pass",
      colorAttachments: [
        {
          view: this.path_trace_target_view,
          loadOp: "load" as GPULoadOp, // [0.0, 0.0, 0.0, 0.0],  #
          storeOp: "store" as GPUStoreOp,
        },
      ],
    });

    render_pass.setPipeline(this.path_trace_pipeline);
    render_pass.setBindGroup(0, this.path_trace_bind_group);
    render_pass.setVertexBuffer(0, this.quad_vbuf);
    render_pass.setIndexBuffer(this.quad_ibuf, "uint16");
    render_pass.drawIndexed(3 * 2, 1, 0, 0, 0);

    render_pass.end();

    // // STEP 2
    // // Render(copy) the final pathTracingScene output(above) into screenTextureRenderTarget
    // // This will be used as a new starting point for Step 1 above
    commandEncoder.copyTextureToTexture(
      { texture: this.path_trace_target },
      { texture: this.screen_target },
      [this.path_trace_target.width, this.path_trace_target.height]
    );

    // // STEP 3
    // // Render full screen quad with generated pathTracingRenderTarget in STEP 1 above.
    // // After the image is gamma corrected, it will be shown on the screen as the final accumulated output
    const render_pass2: GPURenderPassEncoder = commandEncoder.beginRenderPass({
      label: "tonemap-to-screen pass",
      colorAttachments: [
        {
          view: renderTarget.getColorTextureView(),
          clearValue: [0, 0, 0, 0], //scene.background_color,  // wgpu.LoadOp.load or color
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
        },
      ],
    });

    render_pass2.setPipeline(this.tonemap_pipeline);
    //########
    render_pass2.setBindGroup(0, this.tonemap_bind_group);
    //########
    render_pass2.setVertexBuffer(0, this.quad_vbuf);
    render_pass2.setIndexBuffer(this.quad_ibuf, "uint16");
    render_pass2.drawIndexed(3 * 2, 1, 0, 0, 0);

    render_pass2.end();

    // const denoiseLerpC = 0.33 * (Math.max(this.sampleCounter - 1, 1.0) * 0.035);
    // if (denoiseLerpC > 0.0 && denoiseLerpC < 1.0) {
    // this.screenOutputDenoiseMaterial.uniforms.gDenoiseLerpC.value = denoiseLerpC;
    // this.screenOutputMesh.material = this.screenOutputDenoiseMaterial;
    // } else {
    // this.screenOutputMesh.material = this.screenOutputMaterial;
    // }
    // this.screenOutputDenoiseMaterial.uniforms.gDenoisePixelSize.value.x = this.pathTracingUniforms.uResolution.value.x;
    // this.screenOutputDenoiseMaterial.uniforms.gDenoisePixelSize.value.y = this.pathTracingUniforms.uResolution.value.y;
  }

  update_luts(scene: Scene, command_encoder: GPUCommandEncoder) {
    // use first 4 enabled channels
    let i = 0;
    const channel_state = [
      { enabled: true },
      { enabled: true },
      { enabled: true },
      { enabled: false },
    ];
    const volume = scene.volumes[0].volume;
    for (let ch in channel_state) {
      if (i >= 4) {
        break;
      }
      if (!channel_state[ch].enabled) {
        continue;
      }

      // this only works because bytes_per_row is multiple of 256??
      command_encoder.copyBufferToTexture(
        {
          buffer: volume.luts[ch],
          //origin: [0, 0, 0],
          bytesPerRow: volume.luts[ch].size,
        },
        { texture: this.lut_textures, origin: [0, i, 0] },
        [256, 1, 1]
      );

      this.channelsdata.g_intensityMax[i] = 1.0;
      this.channelsdata.g_intensityMin[i] = 0.0;
      this.channelsdata.g_opacity[i] = 1.0;
      this.channelsdata.g_emissive[i] = vec4.fromValues(0.0, 0.0, 0.0, 0.0);
      this.channelsdata.g_diffuse[i] = vec4.fromValues(1.0, 1.0, 0.0, 1.0);
      this.channelsdata.g_specular[i] = vec4.fromValues(0.0, 0.0, 0.0, 1.0);
      this.channelsdata.g_roughness[i] = 0.0;

      i = i + 1;
    }
    this.channelsdata.g_intensityMax = vec4.fromValues(1.0, 1.0, 1.0, 1.0);
    this.channelsdata.g_intensityMin = vec4.fromValues(0.0, 0.0, 0.0, 0.0);
    this.channelsdata.g_opacity = vec4.fromValues(1.0, 1.0, 1.0, 1.0);
    this.channelsdata.g_emissive = [
      vec4.fromValues(0.0, 0.0, 0.0, 0.0),
      vec4.fromValues(0.0, 0.0, 0.0, 0.0),
      vec4.fromValues(0.0, 0.0, 0.0, 0.0),
      vec4.fromValues(0.0, 0.0, 0.0, 0.0),
    ];
    this.channelsdata.g_diffuse = [
      vec4.fromValues(1.0, 0.0, 0.0, 1.0),
      vec4.fromValues(0.0, 1.0, 0.0, 1.0),
      vec4.fromValues(0.0, 0.0, 1.0, 1.0),
      vec4.fromValues(1.0, 1.0, 1.0, 1.0),
    ];
    this.channelsdata.g_specular = [
      vec4.fromValues(0.0, 0.0, 0.0, 1.0),
      vec4.fromValues(0.0, 0.0, 0.0, 1.0),
      vec4.fromValues(0.0, 0.0, 0.0, 1.0),
      vec4.fromValues(0.0, 0.0, 0.0, 1.0),
    ];
    this.channelsdata.g_roughness = vec4.fromValues(0.0, 0.0, 0.0, 0.0);
    this.channels_dirty = true;
    this.renderparams.g_nChannels = Math.min(i, 4);
    this.renderparams_dirty = true;
  }

  combine_volume_channels(scene: Scene) {
    // TODO DO THIS ONLY IF ENABLED CHANNELS CHANGED
    // TODO this is cpu->gpu memory move.  could be done entirely on GPU?

    const sx = this.volume.getDims()[2];
    const sy = this.volume.getDims()[1];
    const sz = this.volume.getDims()[0];

    const data = new Uint8Array(sz * sy * sx * 4).fill(0);
    const channel_state = [
      { enabled: true },
      { enabled: true },
      { enabled: true },
      { enabled: false },
    ];

    // use first 4 enabled channels
    let i = 0;
    for (let ch = 0; ch < channel_state.length; ++ch) {
      if (i >= 4) {
        break;
      }
      if (!channel_state[ch].enabled) {
        continue;
      }
      // copy channel data ch into data, spread every i
      for (let j = 0; j < sx * sy * sz; ++j) {
        data[j * 4 + i] = this.volume.getChannel(ch).data[j];
      }
      i = i + 1;
    }

    // // defaults to rgba and unsignedbytetype so dont need to supply format this time.
    //    this.volumedata_4channel = data;

    // ship data up to volume texture for pathtrace
    this.device.queue.writeTexture(
      { texture: this.volume_texture, origin: [0, 0, 0], mipLevel: 0 },
      data,
      { bytesPerRow: sx * 4, rowsPerImage: sy },
      [sx, sy, sz]
    );
  }
}
