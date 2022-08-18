import Scene from "./scene";

import { mat4 } from "gl-matrix";

import Mesh from "./mesh";
import { ChannelState, Volume } from "./volume";

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
  // TODO what happens when a new channel gets added to the Volume?
  public channel_state: ChannelState[];

  constructor(volume: Volume, transform: mat4) {
    this.volume = volume;
    this.transform = transform;

    this.channel_state = [];
    const defcolors: [number, number, number][] = [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ];
    for (let i = 0; i < this.volume.channels.length; i++) {
      this.channel_state.push(
        new ChannelState(i < 3, defcolors[i % defcolors.length], 0, 255)
      );
    }
  }

  getVolume(): Volume {
    return this.volume;
  }

  getTransform(): mat4 {
    return this.transform;
  }
}

export { SceneObject, SceneMesh, SceneVolume };
