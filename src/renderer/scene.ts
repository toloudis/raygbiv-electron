import { mat4 } from "gl-matrix";

import SceneObject from "./sceneObject";
import Mesh from "./mesh";
import Shader from "./shader";

class Scene {
  public objects: SceneObject[];

  public addSceneObject(mesh: Mesh, shader: Shader, transform: mat4) {
    // stick this data into a gpu buffer
    const uniformBuffer: GPUBuffer = shader.createUniformBuffer();

    // attach this buffer to the shader
    const shaderuniformbindgroup = shader.createShaderBindGroup(uniformBuffer);

    this.objects.push(new SceneObject(mesh, transform));
    // {
    //   //pipeline: this.triangleShaderPipeline,
    //   mesh: mesh,
    //   //shaderuniformbindgroup,
    //   //uniformBuffer,
    //   transform: transform,
    // });
  }
}

export default Scene;
