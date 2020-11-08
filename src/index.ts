import * as WEBGPU from "@webgpu/types";

import { vec3, mat4 } from "gl-matrix";

import MyRenderer from "./renderer/renderer";
import Graphics from "./renderer/graphics";
import Camera from "./renderer/camera";
import CameraController from "./renderer/cameraController";
import Scene from "./renderer/scene";
import { VolumeMaker } from "./renderer/geometries";

const camera = new Camera();
const scene = new Scene();

// aim camera at scene
camera.setPosition(vec3.fromValues(0, 0, 100));
camera.setTarget(vec3.fromValues(0, 0, 0));
camera.setUp(vec3.fromValues(0, 1, 0));

const graphics = new Graphics();

const CANVAS_ID = "raygbiv";

// initialize graphics here
graphics.init().then(async () => {
  const canvas: HTMLCanvasElement = document.getElementById(
    CANVAS_ID
  ) as HTMLCanvasElement;
  // tell the graphics system that we will render to this canvas
  const renderTarget = graphics.createCanvasRenderTarget(canvas);

  // install camera controller
  const controller = new CameraController(camera, canvas);
  camera.setProjection(
    canvas.width / canvas.height,
    (60.0 * Math.PI) / 180.0,
    0.1,
    1000.0
  );

  const myMesh = graphics.createMesh(
    new Uint16Array([0, 1, 2]),
    new Float32Array([1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0]),
    null,
    new Float32Array([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0])
  );

  const voldata = VolumeMaker.createSphere(128, 128, 128, 32);
  const myVol = graphics.createVolume(voldata, 128, 128, 128, 1.0, 1.0, 1.0);

  //const shaderobj = myRenderer.triangleShader;

  //uniformBuffer.setSubData(0, camera.getProjectionMatrix(), 0, )

  // Graphics Pipeline

  // const pipeline: GPURenderPipeline = myRenderer.createRenderPipeline(
  //   shaderobj
  // );

  const mOrigin = mat4.fromTranslation(mat4.create(), vec3.fromValues(0, 0, 0));
  scene.addSceneObject(myVol, mOrigin);
  const sceneRenderer = await graphics.createSimpleVolumeRenderer();

  // const m1 = mat4.fromTranslation(mat4.create(), vec3.fromValues(1, 0, 1));
  // scene.addSceneObject(myMesh, m1);
  // const m2 = mat4.fromTranslation(mat4.create(), vec3.fromValues(-1, 0, -1));
  // scene.addSceneObject(myMesh, m2);
  // const m3 = mat4.fromTranslation(mat4.create(), vec3.fromValues(0, 0, 0));
  // scene.addSceneObject(myMesh, m3);

  // const sceneRenderer = await graphics.createDefaultRenderer();

  // infinite render loop.
  function renderloop() {
    renderTarget.swap();
    controller.update();
    sceneRenderer.render(renderTarget, camera, scene, 0.0);
    requestAnimationFrame(renderloop);
  }
  requestAnimationFrame(renderloop);
});
