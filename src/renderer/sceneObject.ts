import Scene from "./scene";

import { mat4 } from "gl-matrix";

import Mesh from "./mesh";
import { Volume } from "./volume";

interface SceneObject {
  getTransform(): mat4;
}

class SceneMesh implements SceneObject {
  public mesh: Mesh;
  public transform: mat4;

  constructor(mesh: Mesh, transform: mat4) {
    this.mesh = mesh;
    this.transform = transform;
  }

  getMesh(): Mesh {
    return this.mesh;
  }

  getTransform(): mat4 {
    return this.transform;
  }
}

class SceneVolume implements SceneObject {
  public volume: Volume;
  public transform: mat4;

  constructor(volume: Volume, transform: mat4) {
    this.volume = volume;
    this.transform = transform;
  }

  getVolume(): Volume {
    return this.volume;
  }

  getTransform(): mat4 {
    return this.transform;
  }
}

export { SceneObject, SceneMesh, SceneVolume };
