import Scene from "./scene";

import { mat4 } from "gl-matrix";

import Mesh from "./mesh";

class SceneObject {
  private mesh: Mesh;
  private transform: mat4;

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
export default SceneObject;
