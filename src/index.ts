import * as WEBGPU from "@webgpu/types";

import { vec3, mat4 } from "gl-matrix";

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

  //uniformBuffer.setSubData(0, camera.getProjectionMatrix(), 0, )

  // Graphics Pipeline

  const pipeline: GPURenderPipeline = myRenderer.createRenderPipeline(
    shaderobj
  );

  const m1 = mat4.fromTranslation(mat4.create(), vec3.fromValues(1, 0, 1));
  myRenderer.addSceneObject(pipeline, myMesh, shaderobj, m1);
  const m2 = mat4.fromTranslation(mat4.create(), vec3.fromValues(-1, 0, -1));
  myRenderer.addSceneObject(pipeline, myMesh, shaderobj, m2);
  const m3 = mat4.fromTranslation(mat4.create(), vec3.fromValues(0, 0, 0));
  myRenderer.addSceneObject(pipeline, myMesh, shaderobj, m3);

  // infinite render loop.
  function renderloop() {
    controller.update();
    myRenderer.render(camera);
    requestAnimationFrame(renderloop);
  }
  requestAnimationFrame(renderloop);
});
