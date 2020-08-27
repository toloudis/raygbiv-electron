import Mesh from "./mesh";
import Camera from "./camera";
import Scene from "./scene";

enum EPixelFormat {
  RGBA_F32,
  RGBA_U8,
}

interface IRenderTarget {
  swap(): void;
  // block till rendering is done and return pixels data in a buffer
  getPixels(): Float32Array;
  setSize(w: number, h: number): void;
  getWidth(): number;
  getHeight(): number;
}

interface ISceneRenderer {
  render(
    target: IRenderTarget,
    camera: Camera,
    scene: Scene,
    simulationTime: number
  ): void;
}

interface IGraphics {
  init(): void;
  cleanup(): void;
  createDefaultRenderer(): ISceneRenderer;
  //createNormalsRenderer(): ISceneRenderer;
  createCanvasRenderTarget(canvas: HTMLCanvasElement): IRenderTarget;
  // createImageRenderTarget(
  //   w: number,
  //   h: number,
  //   pixelFormat: EPixelFormat
  // ): IRenderTarget;

  createMesh(
    indices: Uint32Array | Uint16Array,
    vertices: Float32Array,
    normals: Float32Array,
    uvs?: Float32Array
  ): Mesh;
}

export { EPixelFormat, ISceneRenderer, IRenderTarget, IGraphics };
