import { mat4 } from "gl-matrix";

import { SceneObject, SceneMesh, SceneVolume } from "./sceneObject";
import Mesh from "./mesh";
import Volume from "./volume";
import Shader from "./shader";

class Scene {
  public objects: SceneObject[];

  constructor() {
    this.objects = [];
  }

  public addSceneObject(mesh: Mesh | Volume, transform: mat4) {
    // TODO Switch on type
    this.objects.push(new SceneMesh(mesh, transform));
    this.objects.push(new SceneVolume(mesh, transform));
  }
}

export default Scene;
