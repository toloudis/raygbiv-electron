interface CubeOptions {
  dimensions?: [number, number, number];
  position?: [number, number, number];
}
export function createCube(options?: CubeOptions) {
  options = options || {};

  let dimensions = options.dimensions || [1, 1, 1];
  let position = options.position || [0, 0, 0];

  const positions = new Float32Array([
    // front (+Z)
    position[0] + -dimensions[0] * 0.5,
    position[1] + -dimensions[1] * 0.5,
    position[2] + dimensions[2] * 0.5,

    position[0] + dimensions[0] * 0.5,
    position[1] + -dimensions[1] * 0.5,
    position[2] + dimensions[2] * 0.5,

    position[0] + dimensions[0] * 0.5,
    position[1] + dimensions[1] * 0.5,
    position[2] + dimensions[2] * 0.5,

    position[0] + -dimensions[0] * 0.5,
    position[1] + dimensions[1] * 0.5,
    position[2] + dimensions[2] * 0.5,

    // back (-Z)
    position[0] + -dimensions[0] * 0.5,
    position[1] + -dimensions[1] * 0.5,
    position[2] + -dimensions[2] * 0.5,

    position[0] + dimensions[0] * 0.5,
    position[1] + -dimensions[1] * 0.5,
    position[2] + -dimensions[2] * 0.5,

    position[0] + dimensions[0] * 0.5,
    position[1] + dimensions[1] * 0.5,
    position[2] + -dimensions[2] * 0.5,

    position[0] + -dimensions[0] * 0.5,
    position[1] + dimensions[1] * 0.5,
    position[2] + -dimensions[2] * 0.5,
  ]);

  const indices = new Uint16Array([
    // front
    0, 1, 2, 2, 3, 0,
    // right
    1, 5, 6, 6, 2, 1,
    // back
    5, 6, 7, 7, 4, 5,
    // left
    4, 0, 3, 3, 7, 4,
    // bottom
    4, 5, 1, 1, 0, 4,
    // top
    3, 2, 6, 6, 7, 3,
  ]);

  return {
    positions,
    indices,
  };
}

export class VolumeMaker {
  /**
   * Rasterize a signed distance function into a volume of vx * vy * vz dimensions. This is a binary filling operation.
   * @param {number} vx
   * @param {number} vy
   * @param {number} vz
   * @param {function} sdFunc A function f(x,y,z) that returns a distance. f < 0 will be the interior of the volume, and f>=0 will be outside.
   */
  static createVolume(
    vx: number,
    vy: number,
    vz: number,
    sdFunc: (x: number, y: number, z: number) => number
  ) {
    var data = new Uint8Array(vx * vy * vz).fill(0);
    var cx = vx / 2;
    var cy = vy / 2;
    var cz = vz / 2;
    var offset, px, py, pz;
    for (var i = 0; i < vz; ++i) {
      for (var j = 0; j < vy; ++j) {
        for (var k = 0; k < vx; ++k) {
          offset = i * (vx * vy) + j * vx + k;
          px = k - cx;
          py = j - cy;
          pz = i - cz;
          if (sdFunc(px, py, pz) < 0) {
            data[offset] = 255;
          } else {
            data[offset] = 0;
          }
        }
      }
    }
    return data;
  }

  /**
   * Create a volume filled with a sphere in the center
   * @param {number} vx
   * @param {number} vy
   * @param {number} vz
   * @param {number} radius
   */
  static createSphere(vx: number, vy: number, vz: number, radius: number) {
    return VolumeMaker.createVolume(vx, vy, vz, (px, py, pz) => {
      return Math.sqrt(px * px + py * py + pz * pz) - radius;
    });
  }

  /**
   * Create a volume with a cylinder centered inside.
   * @param {number} vx
   * @param {number} vy
   * @param {number} vz
   * @param {number} hx width of cap (?)
   * @param {number} hy depth of cap (?)
   */
  static createCylinder(
    vx: number,
    vy: number,
    vz: number,
    hx: number,
    hy: number
  ) {
    var dx, dy, mdx, mdy;
    return VolumeMaker.createVolume(vx, vy, vz, (px, py, pz) => {
      dx = Math.abs(Math.sqrt(px * px + pz * pz)) - hx;
      dy = Math.abs(py) - hy;
      mdx = Math.max(dx, 0.0);
      mdy = Math.max(dy, 0.0);
      return Math.min(Math.max(dx, dy), 0.0) + Math.sqrt(mdx * mdx + mdy * mdy);
    });
  }

  /**
   * Create a volume with a torus centered inside
   * @param {number} vx
   * @param {number} vy
   * @param {number} vz
   * @param {number} tx inner radius
   * @param {number} ty outer radius
   */
  static createTorus(
    vx: number,
    vy: number,
    vz: number,
    tx: number,
    ty: number
  ) {
    var qx, qy;
    return VolumeMaker.createVolume(vx, vy, vz, (px, py, pz) => {
      qx = Math.sqrt(px * px + pz * pz) - tx;
      qy = py;
      return Math.sqrt(qx * qx + qy * qy) - ty;
    });
  }

  /**
   * Create a volume with a cone centered inside.  cx, cy must be a 2d normalized pair...?
   * @param {number} vx
   * @param {number} vy
   * @param {number} vz
   * @param {number} cx base radius
   * @param {number} cy height
   */
  static createCone(
    vx: number,
    vy: number,
    vz: number,
    cx: number,
    cy: number
  ) {
    var q;
    return VolumeMaker.createVolume(vx, vy, vz, (px, py, pz) => {
      q = Math.sqrt(px * px + py * py);
      return cx * q + cy * pz;
    });
  }
}
