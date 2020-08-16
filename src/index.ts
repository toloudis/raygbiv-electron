import * as WEBGPU from "@webgpu/types";

import { vec3 } from "gl-matrix";

import MyRenderer from "./renderer/renderer";
import Camera from "./renderer/camera";
import CameraController from "./renderer/cameraController";

const camera = new Camera();
// aim camera at scene
camera.setPosition(vec3.fromValues(0, 0, 100));
camera.setTarget(vec3.fromValues(0, 0, 0));
camera.setUp(vec3.fromValues(0, 1, 0));

const myRenderer = new MyRenderer();

const CANVAS_ID = "raygbiv";

// initialize graphics here
myRenderer.begin().then(() => {
  // tell the graphics system that we will render to this canvas
  myRenderer.initCanvas(CANVAS_ID);

  // install camera controller
  const canvas: HTMLCanvasElement = document.getElementById(
    CANVAS_ID
  ) as HTMLCanvasElement;
  const controller = new CameraController(camera, canvas);
  camera.setProjection(
    canvas.width / canvas.height,
    (60.0 * Math.PI) / 180.0,
    0.1,
    1000.0
  );

  const myMesh = myRenderer.createMesh(
    new Float32Array([1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0]),
    null,
    new Float32Array([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]),
    new Uint16Array([0, 1, 2])
  );

  const shaderobj = myRenderer.triangleShader;

  const uniformData = new Float32Array([
    // ♟️ ModelViewProjection Matrix
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,

    // 🔴 Primary Color
    0.9,
    0.1,
    0.3,
    1.0,

    // 🟣 Accent Color
    0.8,
    0.2,
    0.8,
    1.0,
  ]);

  // stick this data into a gpu buffer
  const uniformBuffer: GPUBuffer = myRenderer.createBuffer(
    uniformData,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  );
  // attach this buffer to the shader
  const shaderuniformbindgroup = shaderobj.createShaderBindGroup(uniformBuffer);

  //uniformBuffer.setSubData(0, camera.getProjectionMatrix(), 0, )

  // Graphics Pipeline

  const pipeline: GPURenderPipeline = myRenderer.createRenderPipeline(
    shaderobj
  );

  myRenderer.addSceneObject(
    pipeline,
    myMesh,
    shaderuniformbindgroup,
    uniformBuffer
  );

  // infinite render loop.
  function renderloop() {
    controller.update();
    myRenderer.render(camera);
    requestAnimationFrame(renderloop);
  }
  requestAnimationFrame(renderloop);
});
