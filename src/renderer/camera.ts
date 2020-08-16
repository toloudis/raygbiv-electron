import { mat4, vec3 } from "gl-matrix";

class Camera {
  private aspect = 1.0;
  private fov = Math.PI / 2.0;
  private near = 1.0;
  private far = 100.0;

  private position: vec3;
  private target: vec3;
  private up: vec3;

  private projectionMatrix: mat4;
  private viewMatrix: mat4;
  private projectionDirty = true;
  private viewDirty = true;

  public zoom = 1.0;

  public isPerspectiveCamera = true;
  public isOrthographicCamera = false;

  constructor() {
    this.position = vec3.fromValues(0, 0, 0);
    this.target = vec3.fromValues(0, 0, 1);
    this.up = vec3.fromValues(0, 1, 0);
    this.projectionMatrix = mat4.create();
    this.viewMatrix = mat4.create();
    this.update();
  }

  public getPosition(): vec3 {
    return this.position;
  }
  public getTarget(): vec3 {
    return this.target;
  }
  public getUp(): vec3 {
    return this.up;
  }

  public getProjectionMatrix(): mat4 {
    this.updateProjectionMatrix();
    return this.projectionMatrix;
  }

  public getViewMatrix(): mat4 {
    this.updateViewMatrix();
    return this.viewMatrix;
  }

  public setProjection(
    aspect: number,
    fov: number,
    near: number,
    far: number
  ): void {
    this.aspect = aspect;
    this.fov = fov;
    this.near = near;
    this.far = far;
    this.projectionDirty = true;
  }

  public setPosition(p: vec3): void {
    vec3.set(this.position, p[0], p[1], p[2]);
    this.viewDirty = true;
  }

  public setUp(p: vec3): void {
    vec3.set(this.up, p[0], p[1], p[2]);
    this.viewDirty = true;
  }

  public setTarget(p: vec3): void {
    vec3.set(this.target, p[0], p[1], p[2]);
    this.viewDirty = true;
  }

  public update(): void {
    this.updateProjectionMatrix();
    this.updateViewMatrix();
  }

  private updateViewMatrix() {
    if (this.viewDirty) {
      mat4.lookAt(this.viewMatrix, this.position, this.target, this.up);
      this.viewDirty = false;
    }
  }
  public updateProjectionMatrix(): void {
    if (this.projectionDirty) {
      mat4.perspective(
        this.projectionMatrix,
        this.fov,
        this.aspect,
        this.near,
        this.far
      );
      this.projectionDirty = false;
    }
  }
}
export default Camera;
