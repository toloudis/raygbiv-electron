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

  public addSceneObject(mesh: Mesh | Volume, transform: mat4) {
    // TODO Switch on type
    if (mesh instanceof Mesh) {
      this.objects.push(new SceneMesh(mesh, transform));
    } else if (mesh instanceof Volume) {
      this.volumes.push(new SceneVolume(mesh, transform));
    }
  }
}

export default Scene;
