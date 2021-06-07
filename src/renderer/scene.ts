import { mat4 } from "gl-matrix";

import { SceneObject, SceneMesh, SceneVolume } from "./sceneObject";
import Mesh from "./mesh";
import Volume from "./volume";

class Scene {
  public objects: SceneObject[];
  public volumes: SceneVolume[];

  constructor() {
    this.objects = [];
    this.volumes = [];
  }

  public addSceneObject(obj: Mesh | Volume, transform: mat4) {
    // TODO Switch on type
    if (obj instanceof Mesh) {
      this.objects.push(new SceneMesh(obj, transform));
    } else if (obj instanceof Volume) {
      this.volumes.push(new SceneVolume(obj, transform));
    }
  }
}

export default Scene;
