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
    0,
    1,
    2,
    2,
    3,
    0,
    // right
    1,
    5,
    6,
    6,
    2,
    1,
    // back
    7,
    6,
    5,
    5,
    4,
    7,
    // left
    4,
    0,
    3,
    3,
    7,
    4,
    // bottom
    4,
    5,
    1,
    1,
    0,
    4,
    // top
    3,
    2,
    6,
    6,
    7,
    3,
  ]);

  return {
    positions,
    indices,
  };
}
