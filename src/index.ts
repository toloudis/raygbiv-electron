import { vec3, mat4 } from "gl-matrix";
import { Pane } from "tweakpane";

import Graphics from "./renderer/graphics";
import Camera from "./renderer/camera";
import CameraController from "./renderer/cameraController";
import Scene from "./renderer/scene";
import { VolumeMaker } from "./renderer/geometries";
import SimpleVolumeRenderer from "./renderer/simpleVolumeRenderer";

const camera = new Camera();
const scene = new Scene();

// aim camera at scene
camera.setPosition(vec3.fromValues(0, 0, 3));
camera.setTarget(vec3.fromValues(0, 0, 0));
camera.setUp(vec3.fromValues(0, 1, 0));

const graphics = new Graphics();

const CANVAS_ID = "raygbiv";

// initialize graphics here
graphics
  .init()
  .then(async () => {
    const pane = new Pane();

    // tell the graphics system that we will render to this canvas

    const canvas: HTMLCanvasElement = document.getElementById(
      CANVAS_ID
    ) as HTMLCanvasElement;
    const renderTarget = graphics.createCanvasRenderTarget(canvas);

    // install camera controller
    const controller = new CameraController(camera, canvas);
    camera.setProjection(
      canvas.width / canvas.height,
      (60.0 * Math.PI) / 180.0,
      0.1,
      1000.0
    );

    // set up scene objects

    const myMesh = graphics.createMesh(
      new Uint16Array([0, 1, 2]),
      new Float32Array([1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0]),
      null,
      new Float32Array([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0])
    );

    //const voldata = VolumeMaker.createSphere(256, 256, 256, 64);
    const voldata = VolumeMaker.createTorus(256, 256, 256, 96, 16);
    //const voldata = VolumeMaker.createVolume(256, 256, 256, (x, y, z) => -1);
    const myVol = graphics.createVolume(voldata, 256, 256, 256, 1.0, 1.0, 1.0);

    const mOrigin = mat4.fromTranslation(
      mat4.create(),
      vec3.fromValues(0, 0, 0)
    );
    scene.addSceneObject(myVol, mOrigin);

    const m1 = mat4.fromTranslation(mat4.create(), vec3.fromValues(1, 0, 1));
    scene.addSceneObject(myMesh, m1);
    const m2 = mat4.fromTranslation(mat4.create(), vec3.fromValues(-1, 0, -1));
    scene.addSceneObject(myMesh, m2);
    const m3 = mat4.fromTranslation(mat4.create(), vec3.fromValues(0, 0, 0));
    scene.addSceneObject(myMesh, m3);

    // set up scene renderer

    const sceneRenderer = await graphics.createSimpleVolumeRenderer();
    //const sceneRenderer = await graphics.createDefaultRenderer();
    pane.addInput(
      (sceneRenderer as SimpleVolumeRenderer).settings,
      "brightness",
      {
        min: 0,
        max: 2,
        step: 0.01,
      }
    );
    pane.addInput((sceneRenderer as SimpleVolumeRenderer).settings, "density", {
      min: 0,
      max: 1,
      step: 0.01,
    });
    pane.addInput(
      (sceneRenderer as SimpleVolumeRenderer).settings,
      "gammaMin",
      {
        min: 0,
        max: 1,
        step: 0.01,
      }
    );
    pane.addInput(
      (sceneRenderer as SimpleVolumeRenderer).settings,
      "gammaScale",
      {
        min: 0,
        max: 1,
        step: 0.01,
      }
    );
    pane.addInput(
      (sceneRenderer as SimpleVolumeRenderer).settings,
      "gammaMax",
      {
        min: 0,
        max: 1,
        step: 0.01,
      }
    );

    // infinite render loop.

    function renderloop() {
      renderTarget.swap();
      controller.update();
      sceneRenderer.render(renderTarget, camera, scene, 0.0);
      requestAnimationFrame(renderloop);
    }
    requestAnimationFrame(renderloop);
  })
  .catch((reason) => {
    console.log(reason);
  });
