import { mat4 } from "gl-matrix";

import SceneObject from "./sceneObject";
import Mesh from "./mesh";
import Shader from "./shader";

class Scene {
  public objects: SceneObject[];

  constructor() {
    this.objects = [];
  }

  public addSceneObject(mesh: Mesh, transform: mat4) {
    this.objects.push(new SceneObject(mesh, transform));
  }
}

export default Scene;
