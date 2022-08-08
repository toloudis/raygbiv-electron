import { IGraphics, ISceneRenderer, IRenderTarget } from "./api";
import { createGPUBuffer,createGeometryBuffers, createUniformBuffer, concatArrayBuffers } from "./bufferUtil";
import { createQuad } from "./geometries";
import {VolumeShader} from "./ptVolumeShader";
import {TonemapShader} from "./toneMapShader";
import {PreFuseShader} from "./preFuseShader";
import {FuseShader} from "./fuseShader";
import Volume from "./volume";
import Scene from "./scene";
import Camera from "./camera";

import {vec2, vec3, vec4} from "gl-matrix";

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

    sizeBytes():number {
        return this.toBuffer().byteLength;
    }
    toBuffer():Float32Array {
        return new Float32Array([
            this.from[0], this.from[1], this.from[2], 0,
            this.U[0], this.U[1], this.U[2], 0,
            this.V[0], this.V[1], this.V[2], 0,
            this.N[0], this.N[1], this.N[2], 0,
            this.screen[0], this.screen[1], this.screen[2], this.screen[3],
            this.invScreen[0], this.invScreen[1], 0, 0,
            this.focalDistance, this.apertureSize, this.isPerspective, 0,
        ]);
    }
};

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

    sizeBytes():number {
        return this.toBuffer().byteLength;
    }
    toBuffer():Float32Array {
        return new Float32Array([
            this.theta, this.phi, this.width, this.halfWidth, 
            this.height, this.halfHeight, this.distance, this.skyRadius, 
            this.area, this.areaPdf, this.T, 0,
            this.P[0], this.P[1], this.P[2], 0,
            this.target[0], this.target[1], this.target[2], 0,
            this.N[0], this.N[1], this.N[2], 0,
            this.U[0], this.U[1], this.U[2], 0,
            this.V[0], this.V[1], this.V[2], 0,
            this.color[0], this.color[1], this.color[2], 0,
            this.colorTop[0], this.colorTop[1], this.colorTop[2], 0,
            this.colorMiddle[0], this.colorMiddle[1], this.colorMiddle[2], 0,
            this.colorBottom[0], this.colorBottom[1], this.colorBottom[2], 0,
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

    sizeBytes():number {
        return this.toBuffer().byteLength;
    }
    toBuffer():Float32Array {
        return new Float32Array([
            this.gClippedAaBbMin[0], this.gClippedAaBbMin[1], this.gClippedAaBbMin[2], 0,
            this.gClippedAaBbMax[0], this.gClippedAaBbMax[1], this.gClippedAaBbMax[2], this.gDensityScale,
            this.gStepSize, this.gStepSizeShadow, 0,0,
            this.gInvAaBbSize[0], this.gInvAaBbSize[1], this.gInvAaBbSize[2], this.g_nChannels,
            this.gShadingType, 0,0,0,
            this.gGradientDeltaX[0], this.gGradientDeltaX[1], this.gGradientDeltaX[2], 0,
            this.gGradientDeltaY[0], this.gGradientDeltaY[1], this.gGradientDeltaY[2], 0,
            this.gGradientDeltaZ[0], this.gGradientDeltaZ[1], this.gGradientDeltaZ[2], this.gInvGradientDelta,
            this.gGradientFactor, this.uShowLights,0,0,
        ])
    }
}

class ChannelsBuffer {
    g_intensityMax:vec4;
    g_intensityMin:vec4;
    g_opacity:vec4;
    g_emissive:[vec4,vec4,vec4,vec4];
    g_diffuse:[vec4,vec4,vec4,vec4];
    g_specular:[vec4,vec4,vec4,vec4];
    g_roughness:vec4;

    sizeBytes():number {
        return this.toBuffer().byteLength;
    }
    toBuffer():Float32Array {
        return new Float32Array([
            this.g_intensityMax[0], this.g_intensityMax[1], this.g_intensityMax[2], this.g_intensityMax[3],
            this.g_intensityMin[0], this.g_intensityMin[1], this.g_intensityMin[2], this.g_intensityMin[3],
            this.g_opacity[0], this.g_opacity[1], this.g_opacity[2], this.g_opacity[3],
            this.g_emissive[0][0], this.g_emissive[0][1], this.g_emissive[0][2], this.g_emissive[0][3],
            this.g_emissive[1][0], this.g_emissive[1][1], this.g_emissive[1][2], this.g_emissive[1][3],
            this.g_emissive[2][0], this.g_emissive[2][1], this.g_emissive[2][2], this.g_emissive[2][3],
            this.g_emissive[3][0], this.g_emissive[3][1], this.g_emissive[3][2], this.g_emissive[3][3],
            this.g_diffuse[0][0], this.g_diffuse[0][1], this.g_diffuse[0][2], this.g_diffuse[0][3],
            this.g_diffuse[1][0], this.g_diffuse[1][1], this.g_diffuse[1][2], this.g_diffuse[1][3],
            this.g_diffuse[2][0], this.g_diffuse[2][1], this.g_diffuse[2][2], this.g_diffuse[2][3],
            this.g_diffuse[3][0], this.g_diffuse[3][1], this.g_diffuse[3][2], this.g_diffuse[3][3],
            this.g_specular[0][0], this.g_specular[0][1], this.g_specular[0][2], this.g_specular[0][3],
            this.g_specular[1][0], this.g_specular[1][1], this.g_specular[1][2], this.g_specular[1][3],
            this.g_specular[2][0], this.g_specular[2][1], this.g_specular[2][2], this.g_specular[2][3],
            this.g_specular[3][0], this.g_specular[3][1], this.g_specular[3][2], this.g_specular[3][3],
            this.g_roughness[0], this.g_roughness[1], this.g_roughness[2], this.g_roughness[3],
        ])
    }
}

// compositing / progressive render
class ProgressiveBuffer {
    uFrameCounter: number;
    uSampleCounter: number;
    uResolution: vec2;
    sizeBytes():number {
        return this.toBuffer().byteLength;
    }
    toBuffer():Float32Array {
        return new Float32Array([
            this.uFrameCounter, this.uSampleCounter, this.uResolution[0], this.uResolution[1],
        ]);
    }
}

class ExposureBuffer {
    exposure: number;
    sizeBytes():number {
        return this.toBuffer().byteLength;
    }
    toBuffer():Float32Array {
        return new Float32Array([
            this.exposure,0,0,0
        ]);
    }
}


function make_light(
    type=1,
    theta=0,
    phi=3.14159265 * 0.5,
    width=1,
    height=1,
    distance=10,
    sky_radius=1000,
    target=vec3.fromValues(0, 0, 0),
) : LightBuffer{
    const p = vec3.fromValues(
        distance * Math.sin(phi) * Math.sin(theta),
        distance * Math.sin(phi) * Math.cos(theta),
        distance * Math.cos(phi),
    );
    let area = 0;
    if (type == 1){
        target = vec3.add(target, p, vec3.fromValues(0, 0, 1.0));
        area = 4.0 * 3.14159265 * Math.pow(sky_radius, 2.0);
    }else{
        area = width * height;
    }

    // Compute orthogonal basis frame
    let N = vec3.fromValues(0, 0, 0);
    let U = vec3.fromValues(0, 0, 0);
    let V = vec3.fromValues(0, 0, 0);
    N = vec3.sub(N, target, p);
    N = vec3.normalize(N, N);
    // if N and "up" are parallel, then just choose a different "up"
    if ((N[1] == 1.0)||( N[1] == -1.0)){
        U = vec3.cross(U, N, vec3.fromValues(1.0, 0.0, 0.0));
        U = vec3.normalize(U, U);
    }else{
        // standard "up" vector
        U = vec3.cross(U, N, vec3.fromValues(0.0, 1.0, 0.0));
        U = vec3.normalize(U, U);
    }
    V = vec3.cross(V, N, U);
    V = vec3.normalize(V,V);

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
    camera_dirty:boolean;
    channelsdata: ChannelsBuffer;
    channels_buffer: GPUBuffer;
    channels_dirty:boolean;
    compositedata: ProgressiveBuffer;
    composite_buffer: GPUBuffer;
    light_buffer: GPUBuffer;
    lightdata0: LightBuffer;
    lightdata1: LightBuffer;
    lights_dirty:boolean;
    renderparams_buffer: GPUBuffer;
    renderparams: GlobalParamsBuffer;
    renderparams_dirty:boolean;
    exposure_buffer: GPUBuffer;
    exposureparams: ExposureBuffer;
    exposure_dirty:boolean;

    constructor(device: GPUDevice, format: GPUTextureFormat, size: [number, number]) {
        this.device = device;
        this.size = size;
        this.volume = undefined;

        // the quad geometry for drawing render passes
        const quad_data = createQuad();
        const quadBufs = createGeometryBuffers(quad_data.positions, quad_data.indices, device);
        this.quad_vbuf = quadBufs.vertexBuffer;
        this.quad_ibuf = quadBufs.indexBuffer;

        // the tonemapping shader
        this.tonemap_shader = new TonemapShader();
        await this.tonemap_shader.load(device);
        this.tonemap_pipeline = this.setuptonemappipeline(format);

        // the path tracing shader
        this.pathtrace_shader = new VolumeShader();
        await this.pathtrace_shader.load(device);
        this.path_trace_pipeline = this.setupvolpipeline();

        // the render target texture for path tracing
        this.path_trace_target = undefined;
        this.path_trace_target_view = undefined;

        // the render target texture for compositing
        this.screen_target = undefined;
        this.screen_target_view = undefined;

        // sample the volume texture with linear filtering
        this.simple_linear_sampler = this.device.createSampler({
            addressModeU:"clamp-to-edge",
            addressModeV:"clamp-to-edge",
            addressModeW:"clamp-to-edge",
            magFilter:"linear",
            minFilter:"linear",
        }        );

        // we will sample per-pixel for composite purposes (TODO FIXME do we need a sampler if we just do texture loads???)
        this.nearest_sampler = this.device.createSampler({
            addressModeU:"clamp-to-edge",
            addressModeV:"clamp-to-edge",
            addressModeW:"clamp-to-edge",
            magFilter:"nearest",
            minFilter:"nearest",
        });

        // data for uniform buffers for pathtrace
        this.cameradata = new CameraBuffer();
        this.channelsdata = new ChannelsBuffer();
        this.compositedata = new ProgressiveBuffer()
        this.lightdata0 = make_light(
            0,
            0,
            3.14159265 * 0.5,
            1,
            1,
            10,
            1000,
            vec3.fromValues(0, 0, 0),
        )
        this.lightdata1 = make_light(
            1,
            0,
            3.14159265 * 0.5,
            1,
            1,
            10,
            1000,
            vec3.fromValues(0, 0, 0),
        )
        this.renderparams = new GlobalParamsBuffer();

        this.exposureparams = new ExposureBuffer();
        this.exposureparams.exposure = this.exposure_from_slider(0.75);

        // the bind group will bind all these exact buffers. we won't be changing the buffer objects themselves apart from map writes
        this.camera_buffer = createUniformBuffer(this.cameradata.toBuffer(), device);
        this.channels_buffer = createUniformBuffer(this.channelsdata.toBuffer(), device);
        this.composite_buffer = createUniformBuffer(this.compositedata.toBuffer(), device);
        // x2 ?? how to pack the light data as array?
        this.light_buffer = createUniformBuffer(this.lightdata0.toBuffer(), device);
        this.light_buffer =createUniformBuffer(concatArrayBuffers(this.lightdata0.toBuffer(), this.lightdata1.toBuffer()), device);
        this.renderparams_buffer = createUniformBuffer(this.renderparams.toBuffer(), device);
        this.exposure_buffer = createUniformBuffer(this.exposureparams.toBuffer(), device);

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
            label:"lut texture 4ch",
            // arrayLayerCount: 1,
            mipLevelCount: 1,
            sampleCount: 1,
            dimension: "2d",
            format: "rgba32float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
          };
      
        this.lut_textures = this.device.createTexture(lutTextureDesc);
        this.lut_textures_view = this.lut_textures.createView({label:"lut texture view 4ch"});

        this.do_resize(size[0], size[1])
    }

    exposure_from_slider(e:number): number{
        // 1.0 causes division by zero.
        if (e > 0.99999){
            e = 0.99999;}
        return 1.0 / (1.0 - e) - 1.0;
    }

    setuptonemapbindgroup():GPUBindGroup{
        const bind_group0_entries: GPUBindGroupEntry[] = [
            {
                "binding": 0,
                "resource": {
                    "buffer": this.exposure_buffer,
                    "offset": 0,
                    "size": this.exposure_buffer.size,
                },
            },
            {"binding": 1, "resource": this.simple_linear_sampler},
            {"binding": 2, "resource": this.screen_target_view},
        ]
        // Create the wgpu binding objects
        this.tonemap_bind_group = this.device.createBindGroup({
            layout:this.tonemap_shader.bindGroupLayouts[0],
            entries:bind_group0_entries,
        }
        );
        return this.tonemap_bind_group;
    }

    setupvolbindgroup():GPUBindGroup{
        // build bind group
        // this needs to be deferred because volume_texture is not yet set
        const bind_group0_entries: GPUBindGroupEntry[] = [
            {
                "binding": 0,
                "resource": {
                    "buffer": this.camera_buffer,
                    "offset": 0,
                    "size": this.camera_buffer.size,
                },
            },
            {
                "binding": 1,
                "resource": {
                    "buffer": this.light_buffer,
                    "offset": 0,
                    "size": this.light_buffer.size,
                },
            },
            {
                "binding": 2,
                "resource": {
                    "buffer": this.renderparams_buffer,
                    "offset": 0,
                    "size": this.renderparams_buffer.size,
                },
            },
            {
                "binding": 3,
                "resource": {
                    "buffer": this.channels_buffer,
                    "offset": 0,
                    "size": this.channels_buffer.size,
                },
            },
            {
                "binding": 4,
                "resource": {
                    "buffer": this.composite_buffer,
                    "offset": 0,
                    "size": this.composite_buffer.size,
                },
            },
            {"binding": 5, "resource": this.simple_linear_sampler},
            // volume texture changes whenever we have a new volume
            {"binding": 6, "resource": this.volume_texture_view},
            {"binding": 7, "resource": this.nearest_sampler},
            {"binding": 8, "resource": this.lut_textures_view},
            // note that screen_target_view changes on resize
            {"binding": 9, "resource": this.screen_target_view},
        ]
        // Create the wgpu binding objects
        this.path_trace_bind_group = this.device.createBindGroup({
            layout:this.pathtrace_shader.bindGroupLayouts[0],
            entries:bind_group0_entries,
        });
        return this.path_trace_bind_group;
    }

    setuptonemappipeline(
        output_format: GPUTextureFormat
    ) :GPURenderPipeline{
        const render_pipeline = this.device.createRenderPipeline({
            layout:this.tonemap_shader.getPipelineLayout(),
            vertex:this.tonemap_shader.vertexState,
            // we are drawing a fullscreen quad
            primitive:{
                topology: "triangle-list",
                frontFace: "ccw",
                cullMode: "none",
            },
            //depthStencil:None,
            multisample:{
                count: 1,
                mask: 0xFFFFFFFF,
                alphaToCoverageEnabled: false,
            },
            fragment:{
                module: this.tonemap_shader.shaderModule,
                entryPoint: "main_fs",
                targets: [{format: output_format}],
            },
        });
        return render_pipeline;
    }

    setupvolpipeline(
    ) : GPURenderPipeline {
        const render_pipeline = this.device.createRenderPipeline({
            layout:this.pathtrace_shader.getPipelineLayout(),
            vertex:this.pathtrace_shader.vertexState,
            // we are drawing a fullscreen quad
            primitive:{
                topology: "triangle-list",
                frontFace: "ccw",
                cullMode: "none",
            },
            //depthStencil:None,
            multisample:{
                count: 1,
                mask: 0xFFFFFFFF,
                alphaToCoverageEnabled: false,
            },
            fragment:{
                module: this.pathtrace_shader.shaderModule,
                entryPoint: "main_fs",
                targets: [{format: "rgba32float" as GPUTextureFormat}],
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
            size:{
                width: this.volume.pixel_dims[2],
                height: this.volume.pixel_dims[1],
                depthOrArrayLayers: this.volume.pixel_dims[0],
            },
            usage:GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
            dimension:"3d",
            format:"rgba8unorm",
            mipLevelCount:1,
            sampleCount:1,
            label:"volume_texture",
        });
        this.volume_texture_view = this.volume_texture.create_view()
        this.setupvolbindgroup()
        this.updaterenderparams()
    }

    def updaterenderparams(self):
        sx = this.volume.pixel_dims[2]
        sy = this.volume.pixel_dims[1]
        sz = this.volume.pixel_dims[0]

        nstepsize = 1.0
        nshadowstepsize = 1.0
        gradientDelta = 1.0 / max(sx, max(sy, sz))
        // can this be a per-x,y,z value?
        this.renderparams["gInvGradientDelta"] = 1.0 / gradientDelta
        this.renderparams["gGradientDeltaX"] = (gradientDelta, 0, 0)
        this.renderparams["gGradientDeltaY"] = (0, gradientDelta, 0)
        this.renderparams["gGradientDeltaZ"] = (0, 0, gradientDelta)
        this.renderparams["gGradientFactor"] = 0.5
        this.renderparams["gStepSize"] = gradientDelta * nstepsize
        this.renderparams["gStepSizeShadow"] = gradientDelta * nshadowstepsize
        // bounds will go from 0 to physicalSize
        this.renderparams["gInvAaBbSize"] = (
            1.0 / this.volume.physical_dims[2],
            1.0 / this.volume.physical_dims[1],
            1.0 / this.volume.physical_dims[0],
        )
        xmin = 0
        xmax = 1
        ymin = 0
        ymax = 1
        zmin = 0
        zmax = 1
        // centered on 0,0,0
        this.renderparams["gClippedAaBbMin"] = (
            xmin * this.volume.physical_dims[2] - 0.5 * this.volume.physical_dims[2],
            ymin * this.volume.physical_dims[1] - 0.5 * this.volume.physical_dims[1],
            zmin * this.volume.physical_dims[0] - 0.5 * this.volume.physical_dims[0],
        )
        this.renderparams["gClippedAaBbMax"] = (
            xmax * this.volume.physical_dims[2] - 0.5 * this.volume.physical_dims[2],
            ymax * this.volume.physical_dims[1] - 0.5 * this.volume.physical_dims[1],
            zmax * this.volume.physical_dims[0] - 0.5 * this.volume.physical_dims[0],
        )

        this.renderparams["gDensityScale"] = 30.5
        this.renderparams["g_nChannels"] = 4
        this.renderparams["gShadingType"] = 0

        this.renderparams_dirty = True

    def update_camera(self, device: wgpu.GPUDevice, cam: Camera, s: Scene):

        physical_dims = s.volume.physical_dims
        w = this.compositedata["uResolution"][0]
        h = this.compositedata["uResolution"][1]

        // note that cam defaults to point at the origin
        // volume is centered at 0,0,0 and has dimensions of physical_dims

        // we want to put these camera params in the space of the volume

        mydir = glm.vec3(cam.get_target() - cam.get_position())
        // mydir = glm.vec3(cam.get_position() - cam.get_target())
        myup = glm.vec3(cam.get_up())
        // don't rotate this vector.  we are using translation as the pivot point of the object, and THEN rotating.
        // note this needs to be relative to the volume center which must be shifted to 0,0,0
        // i.e. the camera data needs to be in the volume's object space
        mypos = glm.vec3(cam.get_position())

        // // apply volume translation and rotation:
        // // rotate myup, mypos, mydir
        // m = glm.mat4.makeRotationFromQuaternion(new Quaternion().setFromEuler(this.rotation).invert());
        // mypos.sub(this.translation);
        // mypos.applyMatrix4(m);
        // myup.applyMatrix4(m);
        // mydir.applyMatrix4(m);

        N = vec3.normalize(N, glm.vec3(mydir))
        U = vec3.normalize(U, glm.cross(N, myup))
        V = vec3.normalize(V, glm.cross(U, N))

        // the choice of y = scale/aspect or x = scale*aspect is made here to match up with the other raymarch volume
        ortho_scale = 1.0
        fScale = ortho_scale if cam.isOrthographicCamera else Math.tan(0.5 * cam.fov)
        screen = glm.vec4(
            -fScale * cam.aspect,
            fScale * cam.aspect,
            // the "0" Y pixel will be at +Scale.
            fScale,
            -fScale,
        )

        this.cameradata["isPerspective"] = 1 if cam.isPerspectiveCamera else 0
        this.cameradata["from"] = mypos
        this.cameradata["N"] = N
        this.cameradata["U"] = U
        this.cameradata["V"] = V
        this.cameradata["focalDistance"] = cam.get_focal_distance()
        this.cameradata["apertureSize"] = cam.get_aperture_size()
        this.cameradata["screen"] = screen
        // scr = this.pathTracingUniforms.gCamera.value.mScreen;
        this.cameradata["invScreen"] = glm.vec2(
            // the amount to increment for each pixel
            (screen.y - screen.x) / w,
            (screen.w - screen.z) / h,
        )
        // print(this.cameradata)
        this.camera_dirty = True

    def check_resize(self, s):
        if s[0] != this.size[0] or s[1] != this.size[1]:
            this.do_resize(s[0], s[1])
            this.size = s

    def do_resize(self, w, h):
        this.path_trace_target = this.device.create_texture(
            size=(w, h, 1),
            dimension="2d",
            format=wgpu.TextureFormat.rgba32float,
            usage=wgpu.TextureUsage.TEXTURE_BINDING
            | wgpu.TextureUsage.RENDER_ATTACHMENT
            | wgpu.TextureUsage.COPY_SRC,
            label="path_trace_target",
        )
        this.path_trace_target_view = this.path_trace_target.create_view()
        this.screen_target = this.device.create_texture(
            size=(w, h, 1),
            dimension="2d",
            format=wgpu.TextureFormat.rgba32float,
            usage=wgpu.TextureUsage.TEXTURE_BINDING | wgpu.TextureUsage.COPY_DST,
            label="screen_composite_target",
        )
        this.screen_target_view = this.screen_target.create_view()

        this.compositedata["uResolution"] = (w, h)

        this.setuptonemapbindgroup()
        if this.volume is not None:
            this.setupvolbindgroup()

    def render(
        self,
        device,
        command_encoder: wgpu.GPUCommandEncoder,
        target_view: wgpu.GPUTextureView,
        camera,
        scene,
    ):
        // if target_view's size changed since last time, then resize the backing buffers here.
        this.check_resize(target_view.size)

        this.combine_volume_channels(scene)
        this.update_luts(scene, command_encoder)

        // update dirty uniformbuffers
        if camera.dirty:
            this.compositedata["uFrameCounter"] = 0
            this.compositedata["uSampleCounter"] = 0
            camera.dirty = False
        else:
            this.compositedata["uFrameCounter"] = (
                this.compositedata["uFrameCounter"] + 1
            )
            this.compositedata["uSampleCounter"] = (
                this.compositedata["uSampleCounter"] + 1
            )
        this.composite_buffer.map_write(this.compositedata)
        if this.lights_dirty:
            q: wgpu.GPUQueue = device.queue
            q.write_buffer(this.light_buffer, 0, this.lightdata0, 0)
            q.write_buffer(
                this.light_buffer, this.lightdata0.nbytes, this.lightdata1, 0
            )
            this.lights_dirty = False
        if this.renderparams_dirty:
            this.renderparams_buffer.map_write(this.renderparams)
            this.renderparams_dirty = False
        if this.camera_dirty:
            this.camera_buffer.map_write(this.cameradata)
            this.camera_dirty = False
        if this.channels_dirty:
            this.channels_buffer.map_write(this.channelsdata)
            this.channels_dirty = False
        if this.exposure_dirty:
            this.exposure_buffer.map_write(this.exposureparams)
            this.exposure_dirty = False

        // // RENDERING in 3 steps

        // // STEP 1
        // // Perform PathTracing and Render(save) into pathTracingRenderTarget

        // // This is currently rendered as a fullscreen quad with no camera transform in the vertex shader!
        // // It is also composited with screenTextureRenderTarget's texture.
        // // (Read previous screenTextureRenderTarget to use as a new starting point to blend with)
        render_pass: wgpu.GPURenderPassEncoder = command_encoder.begin_render_pass(
            label="path_trace_pass",
            color_attachments=[
                {
                    "view": this.path_trace_target_view,
                    "resolve_target": None,
                    "load_op": wgpu.LoadOp.load,  // [0.0, 0.0, 0.0, 0.0],  #
                    "store_op": wgpu.StoreOp.store,
                }
            ],
        )

        render_pass.set_pipeline(this.path_trace_pipeline)
        render_pass.set_bind_group(0, this.path_trace_bind_group, [], 0, 1)
        render_pass.set_vertex_buffer(0, this.quad_vbuf)
        render_pass.set_index_buffer(this.quad_ibuf, wgpu.IndexFormat.uint16)
        render_pass.draw_indexed(3 * 2, 1, 0, 0, 0)

        render_pass.end()

        // // STEP 2
        // // Render(copy) the final pathTracingScene output(above) into screenTextureRenderTarget
        // // This will be used as a new starting point for Step 1 above
        command_encoder.copy_texture_to_texture(
            {"texture": this.path_trace_target},
            {"texture": this.screen_target},
            this.path_trace_target.size,
        )

        // // STEP 3
        // // Render full screen quad with generated pathTracingRenderTarget in STEP 1 above.
        // // After the image is gamma corrected, it will be shown on the screen as the final accumulated output
        render_pass2: wgpu.GPURenderPassEncoder = command_encoder.begin_render_pass(
            label="tonemap-to-screen pass",
            color_attachments=[
                {
                    "view": target_view,
                    "resolve_target": None,
                    "clear_value": scene.background_color,  // wgpu.LoadOp.load or color
                    "load_op": wgpu.LoadOp.clear,
                    "store_op": wgpu.StoreOp.store,
                }
            ],
        )

        render_pass2.set_pipeline(this.tonemap_pipeline)
        ########
        render_pass2.set_bind_group(0, this.tonemap_bind_group, [], 0, 0)
        ########
        render_pass2.set_vertex_buffer(0, this.quad_vbuf)
        render_pass2.set_index_buffer(this.quad_ibuf, wgpu.IndexFormat.uint16)
        render_pass2.draw_indexed(3 * 2, 1, 0, 0, 0)

        render_pass2.end()

        // const denoiseLerpC = 0.33 * (Math.max(this.sampleCounter - 1, 1.0) * 0.035);
        // if (denoiseLerpC > 0.0 && denoiseLerpC < 1.0) {
        // this.screenOutputDenoiseMaterial.uniforms.gDenoiseLerpC.value = denoiseLerpC;
        // this.screenOutputMesh.material = this.screenOutputDenoiseMaterial;
        // } else {
        // this.screenOutputMesh.material = this.screenOutputMaterial;
        // }
        // this.screenOutputDenoiseMaterial.uniforms.gDenoisePixelSize.value.x = this.pathTracingUniforms.uResolution.value.x;
        // this.screenOutputDenoiseMaterial.uniforms.gDenoisePixelSize.value.y = this.pathTracingUniforms.uResolution.value.y;

    def update_luts(self, scene: Scene, command_encoder: wgpu.GPUCommandEncoder):
        // use first 4 enabled channels
        i = 0
        for ch in range(len(scene.channel_state)):
            if i >= 4:
                break
            if not scene.channel_state[ch].enabled:
                continue

            // this only works because bytes_per_row is multiple of 256??
            command_encoder.copy_buffer_to_texture(
                {
                    "buffer": scene.volume.luts[ch],
                    "origin": (0, 0, 0),
                    "bytes_per_row": scene.volume.luts[ch].size,
                },
                {"texture": this.lut_textures, "origin": (0, i, 0)},
                (256, 1, 1),
            )

            this.channelsdata["g_intensityMax"][i] = 1.0
            this.channelsdata["g_intensityMin"][i] = 0.0
            this.channelsdata["g_opacity"][i] = 1.0
            this.channelsdata["g_emissive"][i] = (0.0, 0.0, 0.0, 0.0)
            this.channelsdata["g_diffuse"][i] = (1.0, 1.0, 0.0, 1.0)
            this.channelsdata["g_specular"][i] = (0.0, 0.0, 0.0, 1.0)
            this.channelsdata["g_roughness"][i] = 0.0

            i = i + 1
        this.channelsdata["g_intensityMax"] = (1.0, 1.0, 1.0, 1.0)
        this.channelsdata["g_intensityMin"] = (0.0, 0.0, 0.0, 0.0)
        this.channelsdata["g_opacity"] = (1.0, 1.0, 1.0, 1.0)
        this.channelsdata["g_emissive"] = (
            (0.0, 0.0, 0.0, 0.0),
            (0.0, 0.0, 0.0, 0.0),
            (0.0, 0.0, 0.0, 0.0),
            (0.0, 0.0, 0.0, 0.0),
        )
        this.channelsdata["g_diffuse"] = (
            (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
        )
        this.channelsdata["g_specular"] = (
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
        )
        this.channelsdata["g_roughness"] = (0.0, 0.0, 0.0, 0.0)
        this.channels_dirty = True
        this.renderparams["g_nChannels"] = min(i, 4)
        this.renderparams_dirty = True

    def combine_volume_channels(self, scene: Scene):
        // TODO DO THIS ONLY IF ENABLED CHANNELS CHANGED
        // TODO this is cpu->gpu memory move.  could be done entirely on GPU?

        sx = this.volume.pixel_dims[2]
        sy = this.volume.pixel_dims[1]
        sz = this.volume.pixel_dims[0]

        data = np.zeros(
            (sz, sy, sx, 4),
            dtype=np.uint8,
        )

        // use first 4 enabled channels
        i = 0
        for ch in range(len(scene.channel_state)):
            if i >= 4:
                break
            if not scene.channel_state[ch].enabled:
                continue

            // copy channel data ch into data, spread every i
            data[:, :, :, i] = this.volume.channels[ch].data[:, :, :]

            // for iz in range(sz):
            //     for iy in range(sy):
            //         for ix in range(sx):
            //             data[iz, iy, ix, i] = this.volume.channels[ch].getIntensity(
            //                 ix, iy, iz
            //             )

            // if this.maskChannelIndex != -1 and this.maskAlpha < 1.0:
            //     maskChannel = this.volume.channels[this.maskChannelIndex]
            //     // const maskMax = maskChannel.getHistogram().dataMax;
            //     maskVal = 1.0
            //     maskAlpha = this.maskAlpha
            //     for iz in range(sz):
            //         for iy in range(sy):
            //             for ix in range(sx):
            //                 // // nonbinary masking
            //                 // // maskVal = maskChannel.getIntensity(ix,iy,iz) * maskAlpha / maskMax;

            //                 // // binary masking
            //                 maskVal = (
            //                     1.0
            //                     if maskChannel.getIntensity(ix, iy, iz) > 0
            //                     else maskAlpha
            //                 )

            //                 data[iz, iy, ix, i] *= maskVal
            i = i + 1

        // // defaults to rgba and unsignedbytetype so dont need to supply format this time.
        this.volumedata_4channel = data

        // ship data up to volume texture for pathtrace
        this.device.queue.write_texture(
            {"texture": this.volume_texture, "origin": (0, 0, 0), "mip_level": 0},
            data,
            {"bytes_per_row": sx * 4, "rows_per_image": sy},
            (sx, sy, sz),
        )
