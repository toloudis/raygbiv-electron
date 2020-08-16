import { quat, vec2, vec3 } from "gl-matrix";

import Camera from "./camera";

const STATE = {
  NONE: -1,
  ROTATE: 0,
  ZOOM: 1,
  PAN: 2,
  TOUCH_ROTATE: 3,
  TOUCH_ZOOM_PAN: 4,
};
const MOUSE = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
  ROTATE: 0,
  DOLLY: 1,
  ZOOM: 1,
  PAN: 2,
};

const EPS = 0.000001;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface MouseButtonConfig {
  LEFT: number;
  RIGHT: number;
  MIDDLE: number;
}

class CameraController {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private state: number;
  private enabled: boolean;
  private mouseButtons: MouseButtonConfig;
  private noRotate: boolean;
  private noZoom: boolean;
  private noPan: boolean;

  private _movePrev: vec2;
  private _moveCurr: vec2;

  private _lastAxis: vec3;
  private _lastAngle: number;

  private _zoomStart: vec2;
  private _zoomEnd: vec2;

  private _touchZoomDistanceStart: number;
  private _touchZoomDistanceEnd: number;

  private _panStart: vec2;
  private _panEnd: vec2;

  private screen: Rect;

  private target: vec3;
  private eye: vec3;

  private target0: vec3;
  private position0: vec3;
  private up0: vec3;
  private zoom0: number;

  private lastPosition: vec3;
  private lastZoom: number;
  private minDistance: number;
  private maxDistance: number;

  private rotateSpeed: number;
  private zoomSpeed: number;
  private panSpeed: number;

  private staticMoving: boolean;
  private dynamicDampingFactor: number;

  constructor(camera: Camera, canvas: HTMLCanvasElement) {
    this.enabled = true;
    this.state = STATE.NONE;
    this.noRotate = false;
    this.noPan = false;
    this.noZoom = false;
    this.camera = camera;
    this.canvas = canvas;
    this.minDistance = 0;
    this.maxDistance = Infinity;
    this.screen = { left: 0, top: 0, width: 0, height: 0 };

    this.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.ZOOM,
      RIGHT: MOUSE.PAN,
    };

    this._movePrev = vec2.fromValues(0, 0);
    this._moveCurr = vec2.fromValues(0, 0);

    this._lastAxis = vec3.fromValues(0, 0, 0);
    this._lastAngle = 0;

    this._zoomStart = vec2.fromValues(0, 0);
    this._zoomEnd = vec2.fromValues(0, 0);

    this._touchZoomDistanceStart = 0;
    this._touchZoomDistanceEnd = 0;

    this._panStart = vec2.fromValues(0, 0);
    this._panEnd = vec2.fromValues(0, 0);

    this.target = vec3.fromValues(0, 0, 0);
    this.eye = vec3.fromValues(0, 0, 0);

    this.target0 = vec3.clone(this.target);
    this.position0 = vec3.clone(this.camera.getPosition());
    this.up0 = vec3.clone(this.camera.getUp());
    this.zoom0 = this.camera.zoom;

    this.lastPosition = vec3.fromValues(0, 0, 0);
    this.lastZoom = 1;

    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.2;
    this.panSpeed = 0.3;

    this.staticMoving = false;
    this.dynamicDampingFactor = 0.2;

    this.contextmenu = this.contextmenu.bind(this);
    this.mousedown = this.mousedown.bind(this);
    this.mousewheel = this.mousewheel.bind(this);
    this.mousemove = this.mousemove.bind(this);
    this.mouseup = this.mouseup.bind(this);
    this.touchstart = this.touchstart.bind(this);
    this.touchmove = this.touchmove.bind(this);
    this.touchend = this.touchend.bind(this);

    this.canvas.addEventListener("contextmenu", this.contextmenu, false);
    this.canvas.addEventListener("mousedown", this.mousedown, false);
    this.canvas.addEventListener("wheel", this.mousewheel, false);

    this.canvas.addEventListener("touchstart", this.touchstart, false);
    this.canvas.addEventListener("touchend", this.touchend, false);
    this.canvas.addEventListener("touchmove", this.touchmove, false);

    this.handleResize();

    // force an update at start
    this.update();
  }

  public handleResize(): void {
    const box = this.canvas.getBoundingClientRect();
    // adjustments come from similar code in the jquery offset() function
    const d = this.canvas.ownerDocument.documentElement;
    this.screen.left = box.left + window.pageXOffset - d.clientLeft;
    this.screen.top = box.top + window.pageYOffset - d.clientTop;
    this.screen.width = box.width;
    this.screen.height = box.height;
  }

  public reset(): void {
    this.state = STATE.NONE;
    //_keyState = STATE.NONE;

    vec3.copy(this.target, this.target0);
    this.camera.setPosition(this.position0);
    this.camera.setUp(this.up0);
    this.camera.zoom = this.zoom0;

    this.camera.updateProjectionMatrix();

    vec3.subtract(this.eye, this.camera.getPosition(), this.target);

    this.camera.setTarget(this.target);

    //this.dispatchEvent(changeEvent);

    vec3.copy(this.lastPosition, this.camera.getPosition());
    this.lastZoom = this.camera.zoom;
  }

  private checkDistances() {
    if (!this.noZoom || !this.noPan) {
      if (vec3.squaredLength(this.eye) > this.maxDistance * this.maxDistance) {
        // TODO division by zero
        vec3.scale(
          this.eye,
          this.eye,
          this.maxDistance / vec3.length(this.eye)
        );
        vec3.add(this.camera.getPosition(), this.target, this.eye);
        vec2.copy(this._zoomStart, this._zoomEnd);
      }

      if (vec3.squaredLength(this.eye) < this.minDistance * this.minDistance) {
        // TODO division by zero
        vec3.scale(
          this.eye,
          this.eye,
          this.minDistance / vec3.length(this.eye)
        );
        vec3.add(this.camera.getPosition(), this.target, this.eye);
        vec2.copy(this._zoomStart, this._zoomEnd);
      }
    }
  }

  public update(): void {
    vec3.subtract(this.eye, this.camera.getPosition(), this.target);

    if (!this.noRotate) {
      this.rotateCamera();
    }

    if (!this.noZoom) {
      this.zoomCamera();
    }

    if (!this.noPan) {
      this.panCamera();
    }

    // camera pos = target + eye
    vec3.add(this.camera.getPosition(), this.target, this.eye);

    if (this.camera.isPerspectiveCamera) {
      this.checkDistances();

      this.camera.setTarget(this.target);

      if (
        vec3.squaredDistance(this.lastPosition, this.camera.getPosition()) > EPS
      ) {
        //this.dispatchEvent(changeEvent);

        vec3.copy(this.lastPosition, this.camera.getPosition());
      }
    } else if (this.camera.isOrthographicCamera) {
      this.camera.setTarget(this.target);

      if (
        vec3.squaredDistance(this.lastPosition, this.camera.getPosition()) >
          EPS ||
        this.lastZoom !== this.camera.zoom
      ) {
        //this.dispatchEvent(changeEvent);

        vec3.copy(this.lastPosition, this.camera.getPosition());
        this.lastZoom = this.camera.zoom;
      }
    } else {
      console.warn("Unsupported camera type");
    }
  }

  private contextmenu(event: MouseEvent) {
    if (!this.enabled) {
      return;
    }
    event.preventDefault();
  }

  private mousedown(event: MouseEvent) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    if (this.state === STATE.NONE) {
      switch (event.button) {
        case this.mouseButtons.LEFT:
          this.state = STATE.ROTATE;
          break;

        case this.mouseButtons.MIDDLE:
          this.state = STATE.ZOOM;
          break;

        case this.mouseButtons.RIGHT:
          this.state = STATE.PAN;
          break;

        default:
          this.state = STATE.NONE;
      }
    }

    const state = this.state; // _keyState !== STATE.NONE ? _keyState : this.state;

    if (state === STATE.ROTATE && !this.noRotate) {
      vec2.copy(
        this._moveCurr,
        this.getMouseOnCircle(event.pageX, event.pageY)
      );
      vec2.copy(this._movePrev, this._moveCurr);
    } else if (state === STATE.ZOOM && !this.noZoom) {
      vec2.copy(
        this._zoomStart,
        this.getMouseOnScreen(event.pageX, event.pageY)
      );
      vec2.copy(this._zoomEnd, this._zoomStart);
    } else if (state === STATE.PAN && !this.noPan) {
      vec2.copy(
        this._panStart,
        this.getMouseOnScreen(event.pageX, event.pageY)
      );
      vec2.copy(this._panEnd, this._panStart);
    }

    this.canvas.ownerDocument.addEventListener(
      "mousemove",
      this.mousemove,
      false
    );
    this.canvas.ownerDocument.addEventListener("mouseup", this.mouseup, false);

    //this.dispatchEvent(startEvent);
  }

  private mousewheel(event: WheelEvent) {
    if (this.enabled === false) return;

    if (this.noZoom === true) return;

    event.preventDefault();
    event.stopPropagation();

    switch (event.deltaMode) {
      case 2:
        // Zoom in pages
        this._zoomStart[1] -= event.deltaY * 0.025;
        break;

      case 1:
        // Zoom in lines
        this._zoomStart[1] -= event.deltaY * 0.01;
        break;

      default:
        // undefined, 0, assume pixels
        this._zoomStart[1] -= event.deltaY * 0.00025;
        break;
    }

    //this.dispatchEvent( startEvent );
    //this.dispatchEvent( endEvent );
  }

  private touchstart(event: TouchEvent) {
    if (this.enabled === false) return;

    event.preventDefault();

    switch (event.touches.length) {
      case 1:
        this.state = STATE.TOUCH_ROTATE;
        vec2.copy(
          this._moveCurr,
          this.getMouseOnCircle(event.touches[0].pageX, event.touches[0].pageY)
        );
        vec2.copy(this._movePrev, this._moveCurr);
        break;

      default:
        {
          // 2 or more
          this.state = STATE.TOUCH_ZOOM_PAN;
          const dx = event.touches[0].pageX - event.touches[1].pageX;
          const dy = event.touches[0].pageY - event.touches[1].pageY;
          this._touchZoomDistanceEnd = this._touchZoomDistanceStart = Math.sqrt(
            dx * dx + dy * dy
          );

          const x = (event.touches[0].pageX + event.touches[1].pageX) / 2;
          const y = (event.touches[0].pageY + event.touches[1].pageY) / 2;
          vec2.copy(this._panStart, this.getMouseOnScreen(x, y));
          vec2.copy(this._panEnd, this._panStart);
        }
        break;
    }

    //this.dispatchEvent( startEvent );
  }

  private touchmove(event: TouchEvent) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    switch (event.touches.length) {
      case 1:
        vec2.copy(this._movePrev, this._moveCurr);
        vec2.copy(
          this._moveCurr,
          this.getMouseOnCircle(event.touches[0].pageX, event.touches[0].pageY)
        );
        break;

      default:
        {
          // 2 or more
          const dx = event.touches[0].pageX - event.touches[1].pageX;
          const dy = event.touches[0].pageY - event.touches[1].pageY;
          this._touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);

          const x = (event.touches[0].pageX + event.touches[1].pageX) / 2;
          const y = (event.touches[0].pageY + event.touches[1].pageY) / 2;
          vec2.copy(this._panEnd, this.getMouseOnScreen(x, y));
        }
        break;
    }
  }

  private touchend(event: TouchEvent) {
    if (this.enabled === false) return;

    switch (event.touches.length) {
      case 0:
        this.state = STATE.NONE;
        break;

      case 1:
        this.state = STATE.TOUCH_ROTATE;
        vec2.copy(
          this._moveCurr,
          this.getMouseOnCircle(event.touches[0].pageX, event.touches[0].pageY)
        );
        vec2.copy(this._movePrev, this._moveCurr);
        break;
    }

    //this.dispatchEvent( endEvent );
  }

  private mousemove(event: MouseEvent) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    const state = this.state; //( _keyState !== STATE.NONE ) ? _keyState : this.state;

    if (state === STATE.ROTATE && !this.noRotate) {
      vec2.copy(this._movePrev, this._moveCurr);
      vec2.copy(
        this._moveCurr,
        this.getMouseOnCircle(event.pageX, event.pageY)
      );
    } else if (state === STATE.ZOOM && !this.noZoom) {
      vec2.copy(this._zoomEnd, this.getMouseOnScreen(event.pageX, event.pageY));
    } else if (state === STATE.PAN && !this.noPan) {
      vec2.copy(this._panEnd, this.getMouseOnScreen(event.pageX, event.pageY));
    }
  }

  private mouseup(event: MouseEvent) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    this.state = STATE.NONE;

    this.canvas.ownerDocument.removeEventListener("mousemove", this.mousemove);
    this.canvas.ownerDocument.removeEventListener("mouseup", this.mouseup);
    //this.dispatchEvent(endEvent);
  }

  private getMouseOnScreen(pageX: number, pageY: number): vec2 {
    return vec2.fromValues(
      (pageX - this.screen.left) / this.screen.width,
      (pageY - this.screen.top) / this.screen.height
    );
  }

  private getMouseOnCircle(pageX: number, pageY: number) {
    return vec2.fromValues(
      (pageX - this.screen.width * 0.5 - this.screen.left) /
        (this.screen.width * 0.5),
      (this.screen.height + 2 * (this.screen.top - pageY)) / this.screen.width // screen.width intentional
    );
  }

  private rotateCamera() {
    // TODO create these as temporaries only once, to help with gc/performance
    // var axis = new Vector3(),
    //   quaternion = new Quaternion(),
    //   eyeDirection = new Vector3(),
    //   objectUpDirection = new Vector3(),
    //   objectSidewaysDirection = new Vector3(),
    //   moveDirection = new Vector3(),
    //   angle;

    const moveDirection = vec3.fromValues(
      this._moveCurr[0] - this._movePrev[0],
      this._moveCurr[1] - this._movePrev[1],
      0
    );
    let angle = vec3.length(moveDirection);

    if (angle) {
      vec3.subtract(this.eye, this.camera.getPosition(), this.target);

      const eyeDirection = vec3.normalize(vec3.create(), this.eye);
      const objectUpDirection = vec3.normalize(
        vec3.create(),
        this.camera.getUp()
      );

      const objectSidewaysDirection = vec3.cross(
        vec3.create(),
        objectUpDirection,
        eyeDirection
      );
      vec3.normalize(objectSidewaysDirection, objectSidewaysDirection);

      vec3.scale(
        objectUpDirection,
        objectUpDirection,
        this._moveCurr[1] - this._movePrev[1]
      );
      vec3.scale(
        objectSidewaysDirection,
        objectSidewaysDirection,
        this._moveCurr[0] - this._movePrev[0]
      );

      vec3.add(moveDirection, objectUpDirection, objectSidewaysDirection);

      const axis = vec3.cross(vec3.create(), moveDirection, this.eye);
      vec3.normalize(axis, axis);

      angle *= this.rotateSpeed;
      const quaternion = quat.setAxisAngle(quat.create(), axis, angle);

      vec3.transformQuat(this.eye, this.eye, quaternion);
      vec3.transformQuat(this.camera.getUp(), this.camera.getUp(), quaternion);

      vec3.copy(this._lastAxis, axis);
      this._lastAngle = angle;
    } else if (!this.staticMoving && this._lastAngle) {
      this._lastAngle *= Math.sqrt(1.0 - this.dynamicDampingFactor);
      vec3.subtract(this.eye, this.camera.getPosition(), this.target);
      const quaternion = quat.setAxisAngle(
        quat.create(),
        this._lastAxis,
        this._lastAngle
      );

      vec3.transformQuat(this.eye, this.eye, quaternion);
      vec3.transformQuat(this.camera.getUp(), this.camera.getUp(), quaternion);
    }

    vec2.copy(this._movePrev, this._moveCurr);
  }

  public zoomCamera(): void {
    let factor;

    if (this.state === STATE.TOUCH_ZOOM_PAN) {
      factor = this._touchZoomDistanceStart / this._touchZoomDistanceEnd;
      this._touchZoomDistanceStart = this._touchZoomDistanceEnd;

      if (this.camera.isPerspectiveCamera) {
        vec3.scale(this.eye, this.eye, factor);
      } else if (this.camera.isOrthographicCamera) {
        this.camera.zoom *= factor;
        this.camera.updateProjectionMatrix();
      } else {
        console.warn("Unsupported camera type");
      }
    } else {
      factor = 1.0 + (this._zoomEnd[1] - this._zoomStart[1]) * this.zoomSpeed;

      if (factor !== 1.0 && factor > 0.0) {
        if (this.camera.isPerspectiveCamera) {
          vec3.scale(this.eye, this.eye, factor);
        } else if (this.camera.isOrthographicCamera) {
          this.camera.zoom /= factor;
          this.camera.updateProjectionMatrix();
        } else {
          console.warn("Unsupported camera type");
        }
      }

      if (this.staticMoving) {
        vec2.copy(this._zoomStart, this._zoomEnd);
      } else {
        this._zoomStart[1] +=
          (this._zoomEnd[1] - this._zoomStart[1]) * this.dynamicDampingFactor;
      }
    }
  }

  public panCamera(): void {
    //var mouseChange = new Vector2(),
    //  objectUp = new Vector3(),
    //  pan = new Vector3();

    const mouseChange = vec2.subtract(
      vec2.create(),
      this._panEnd,
      this._panStart
    );

    if (vec2.squaredLength(mouseChange) > 0) {
      // TODO handle ortho panning
      // if (this.camera.isOrthographicCamera) {
      //   var scale_x =
      //     (this.camera.right - this.camera.left) /
      //     this.camera.zoom /
      //     this.canvas.clientWidth;
      //   var scale_y =
      //     (this.camera.top - this.camera.bottom) /
      //     this.camera.zoom /
      //     this.canvas.clientWidth;

      //   mouseChange[0] *= scale_x;
      //   mouseChange[1] *= scale_y;
      // }

      vec2.scale(
        mouseChange,
        mouseChange,
        vec3.length(this.eye) * this.panSpeed
      );

      const pan = vec3.cross(vec3.create(), this.eye, this.camera.getUp());
      vec3.scale(pan, pan, mouseChange[0] / vec3.length(pan));

      const objectUp = vec3.copy(vec3.create(), this.camera.getUp());
      vec3.scale(objectUp, objectUp, mouseChange[1] / vec3.length(objectUp));
      vec3.add(pan, pan, objectUp);

      vec3.add(this.camera.getPosition(), this.camera.getPosition(), pan);
      vec3.add(this.target, this.target, pan);

      if (this.staticMoving) {
        vec2.copy(this._panStart, this._panEnd);
      } else {
        vec2.subtract(mouseChange, this._panEnd, this._panStart);
        vec2.scale(mouseChange, mouseChange, this.dynamicDampingFactor);
        vec2.add(this._panStart, this._panStart, mouseChange);
      }
    }
  }
}
export default CameraController;
