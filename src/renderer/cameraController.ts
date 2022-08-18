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

// const _changeEvent = { type: "change" };
// const _startEvent = { type: "start" };
// const _endEvent = { type: "end" };

class TrackballControls {
  private object: Camera;
  private domElement: HTMLElement;
  private enabled: boolean;
  private screen: Rect;
  private rotateSpeed: number;
  private zoomSpeed: number;
  private panSpeed: number;
  private noRotate: boolean;
  private noZoom: boolean;
  private noPan: boolean;
  public staticMoving: boolean;
  private dynamicDampingFactor: number;
  private minDistance: number;
  private maxDistance: number;
  private keys: string[];
  private mouseButtons: MouseButtonConfig;
  private target: vec3;
  private target0: vec3;
  private position0: vec3;
  private up0: vec3;
  private zoom0: number;
  public handleResize: () => void;
  public update: () => void;
  public reset: () => void;
  public dispose: () => void;
  private rotateCamera: () => void;
  private zoomCamera: () => void;
  private panCamera: () => void;
  private checkDistances: () => void;

  constructor(object: Camera, domElement: HTMLElement) {
    const scope = this;

    this.object = object;
    this.domElement = domElement;
    this.domElement.style.touchAction = "none"; // disable touch scroll

    // API

    this.enabled = true;

    this.screen = { left: 0, top: 0, width: 0, height: 0 };

    this.rotateSpeed = 2.0;
    this.zoomSpeed = 1.2;
    this.panSpeed = 0.3;

    this.noRotate = false;
    this.noZoom = false;
    this.noPan = false;

    this.staticMoving = false;
    this.dynamicDampingFactor = 0.2;

    this.minDistance = 0;
    this.maxDistance = Infinity;

    this.keys = ["KeyA" /*A*/, "KeyS" /*S*/, "KeyD" /*D*/];

    this.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };

    // internals

    this.target = vec3.fromValues(0, 0, 0);

    const EPS = 0.000001;

    const lastPosition = vec3.fromValues(0, 0, 0);
    let lastZoom = 1;

    let _state = STATE.NONE,
      _keyState = STATE.NONE,
      _touchZoomDistanceStart = 0,
      _touchZoomDistanceEnd = 0,
      _lastAngle = 0;

    const _eye = vec3.fromValues(0, 0, 0),
      _movePrev = vec2.fromValues(0, 0),
      _moveCurr = vec2.fromValues(0, 0),
      _lastAxis = vec3.fromValues(0, 0, 0),
      _zoomStart = vec2.fromValues(0, 0),
      _zoomEnd = vec2.fromValues(0, 0),
      _panStart = vec2.fromValues(0, 0),
      _panEnd = vec2.fromValues(0, 0),
      _pointers: PointerEvent[] = [],
      _pointerPositions: Record<number, vec2> = {};

    // for reset

    this.target0 = vec3.clone(this.target);
    this.position0 = vec3.clone(this.object.getPosition());
    this.up0 = vec3.clone(this.object.getUp());
    this.zoom0 = this.object.zoom;

    // methods

    this.handleResize = function () {
      const box = scope.domElement.getBoundingClientRect();
      // adjustments come from similar code in the jquery offset() function
      const d = scope.domElement.ownerDocument.documentElement;
      scope.screen.left = box.left + window.pageXOffset - d.clientLeft;
      scope.screen.top = box.top + window.pageYOffset - d.clientTop;
      scope.screen.width = box.width;
      scope.screen.height = box.height;
    };

    const getMouseOnScreen = (function () {
      const vector = vec2.fromValues(0, 0);

      return function getMouseOnScreen(pageX: number, pageY: number) {
        vec2.set(
          vector,
          (pageX - scope.screen.left) / scope.screen.width,
          (pageY - scope.screen.top) / scope.screen.height
        );

        return vector;
      };
    })();

    const getMouseOnCircle = (function () {
      const vector = vec2.fromValues(0, 0);

      return function getMouseOnCircle(pageX: number, pageY: number) {
        vec2.set(
          vector,
          (pageX - scope.screen.width * 0.5 - scope.screen.left) /
            (scope.screen.width * 0.5),
          (scope.screen.height + 2 * (scope.screen.top - pageY)) /
            scope.screen.width // screen.width intentional
        );

        return vector;
      };
    })();

    this.rotateCamera = (function () {
      let axis = vec3.fromValues(0, 0, 0),
        quaternion = quat.create(),
        eyeDirection = vec3.fromValues(0, 0, 0),
        objectUpDirection = vec3.fromValues(0, 0, 0),
        objectSidewaysDirection = vec3.fromValues(0, 0, 0),
        moveDirection = vec3.fromValues(0, 0, 0);

      return function rotateCamera() {
        vec3.set(
          moveDirection,
          _moveCurr[0] - _movePrev[0],
          _moveCurr[1] - _movePrev[1],
          0
        );
        let angle = vec3.length(moveDirection);

        if (angle) {
          vec3.subtract(_eye, scope.object.getPosition(), scope.target);

          eyeDirection = vec3.normalize(eyeDirection, _eye);
          objectUpDirection = vec3.normalize(
            objectUpDirection,
            scope.object.getUp()
          );

          objectSidewaysDirection = vec3.cross(
            objectSidewaysDirection,
            objectUpDirection,
            eyeDirection
          );
          vec3.normalize(objectSidewaysDirection, objectSidewaysDirection);

          vec3.scale(
            objectUpDirection,
            objectUpDirection,
            _moveCurr[1] - _movePrev[1]
          );
          vec3.scale(
            objectSidewaysDirection,
            objectSidewaysDirection,
            _moveCurr[0] - _movePrev[0]
          );

          vec3.add(moveDirection, objectUpDirection, objectSidewaysDirection);

          axis = vec3.cross(axis, moveDirection, _eye);
          vec3.normalize(axis, axis);

          angle *= scope.rotateSpeed;
          quaternion = quat.setAxisAngle(quaternion, axis, angle);

          vec3.transformQuat(_eye, _eye, quaternion);
          vec3.transformQuat(
            scope.object.getUp(),
            scope.object.getUp(),
            quaternion
          );

          vec3.copy(_lastAxis, axis);
          _lastAngle = angle;
        } else if (!scope.staticMoving && _lastAngle) {
          _lastAngle *= Math.sqrt(1.0 - scope.dynamicDampingFactor);
          vec3.subtract(_eye, scope.object.getPosition(), scope.target);
          quaternion = quat.setAxisAngle(quaternion, _lastAxis, _lastAngle);

          vec3.transformQuat(_eye, _eye, quaternion);
          vec3.transformQuat(
            scope.object.getUp(),
            scope.object.getUp(),
            quaternion
          );
        }

        vec2.copy(_movePrev, _moveCurr);
      };
    })();

    this.zoomCamera = function () {
      let factor;

      if (_state === STATE.TOUCH_ZOOM_PAN) {
        factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
        _touchZoomDistanceStart = _touchZoomDistanceEnd;

        if (scope.object.isPerspectiveCamera) {
          vec3.scale(_eye, _eye, factor);
        } else if (scope.object.isOrthographicCamera) {
          scope.object.zoom *= factor;
          scope.object.updateProjectionMatrix();
        } else {
          console.warn("TrackballControls: Unsupported camera type");
        }
      } else {
        factor = 1.0 + (_zoomEnd[1] - _zoomStart[1]) * scope.zoomSpeed;

        if (factor !== 1.0 && factor > 0.0) {
          if (scope.object.isPerspectiveCamera) {
            vec3.scale(_eye, _eye, factor);
          } else if (scope.object.isOrthographicCamera) {
            scope.object.zoom /= factor;
            scope.object.updateProjectionMatrix();
          } else {
            console.warn("TrackballControls: Unsupported camera type");
          }
        }

        if (scope.staticMoving) {
          vec2.copy(_zoomStart, _zoomEnd);
        } else {
          _zoomStart[1] +=
            (_zoomEnd[1] - _zoomStart[1]) * scope.dynamicDampingFactor;
        }
      }
    };

    this.panCamera = (function () {
      const mouseChange = vec2.fromValues(0, 0),
        objectUp = vec3.fromValues(0, 0, 0),
        pan = vec3.fromValues(0, 0, 0);

      return function panCamera() {
        vec2.subtract(mouseChange, _panEnd, _panStart);

        if (vec2.squaredLength(mouseChange)) {
          if (scope.object.isOrthographicCamera) {
            // TODO implement ortho camera
            // const scale_x =
            //   (scope.object.right - scope.object.left) /
            //   scope.object.zoom /
            //   scope.domElement.clientWidth;
            // const scale_y =
            //   (scope.object.top - scope.object.bottom) /
            //   scope.object.zoom /
            //   scope.domElement.clientWidth;
            // mouseChange[0] *= scale_x;
            // mouseChange[1] *= scale_y;
          }

          vec2.scale(
            mouseChange,
            mouseChange,
            vec3.length(_eye) * scope.panSpeed
          );

          vec3.cross(pan, _eye, scope.object.getUp());
          vec3.scale(pan, pan, mouseChange[0]);
          vec3.copy(objectUp, scope.object.getUp());
          vec3.scale(objectUp, objectUp, mouseChange[1]);
          vec3.add(pan, pan, objectUp);

          vec3.add(scope.object.getPosition(), scope.object.getPosition(), pan);
          vec3.add(scope.target, scope.target, pan);

          if (scope.staticMoving) {
            vec2.copy(_panStart, _panEnd);
          } else {
            vec2.subtract(mouseChange, _panEnd, _panStart);
            vec2.scale(mouseChange, mouseChange, scope.dynamicDampingFactor);
            vec2.add(_panStart, _panStart, mouseChange);
          }
        }
      };
    })();

    this.checkDistances = function () {
      if (!scope.noZoom || !scope.noPan) {
        if (vec3.squaredLength(_eye) > scope.maxDistance * scope.maxDistance) {
          vec3.scale(_eye, _eye, scope.maxDistance / vec3.length(_eye));
          vec3.add(scope.object.getPosition(), scope.target, _eye);
          vec2.copy(_zoomStart, _zoomEnd);
        }

        if (vec3.squaredLength(_eye) < scope.minDistance * scope.minDistance) {
          vec3.scale(_eye, _eye, scope.minDistance / vec3.length(_eye));
          vec3.add(scope.object.getPosition(), scope.target, _eye);
          vec2.copy(_zoomStart, _zoomEnd);
        }
      }
    };

    this.update = function () {
      vec3.subtract(_eye, scope.object.getPosition(), scope.target);

      if (!scope.noRotate) {
        scope.rotateCamera();
      }

      if (!scope.noZoom) {
        scope.zoomCamera();
      }

      if (!scope.noPan) {
        scope.panCamera();
      }

      vec3.add(scope.object.getPosition(), scope.target, _eye);

      if (scope.object.isPerspectiveCamera) {
        scope.checkDistances();

        scope.object.setTarget(scope.target);

        if (
          vec3.squaredDistance(lastPosition, scope.object.getPosition()) > EPS
        ) {
          //scope.dispatchEvent(_changeEvent);

          vec3.copy(lastPosition, scope.object.getPosition());
        }
      } else if (scope.object.isOrthographicCamera) {
        scope.object.setTarget(scope.target);

        if (
          vec3.squaredDistance(lastPosition, scope.object.getPosition()) >
            EPS ||
          lastZoom !== scope.object.zoom
        ) {
          //scope.dispatchEvent(_changeEvent);

          vec3.copy(lastPosition, scope.object.getPosition());
          lastZoom = scope.object.zoom;
        }
      } else {
        console.warn("THREE.TrackballControls: Unsupported camera type");
      }
    };

    this.reset = function () {
      _state = STATE.NONE;
      _keyState = STATE.NONE;

      vec3.copy(scope.target, scope.target0);
      vec3.copy(scope.object.getPosition(), scope.position0);
      vec3.copy(scope.object.getUp(), scope.up0);
      scope.object.zoom = scope.zoom0;

      scope.object.updateProjectionMatrix();

      vec3.subtract(_eye, scope.object.getPosition(), scope.target);

      scope.object.setTarget(scope.target);

      //scope.dispatchEvent(_changeEvent);

      vec3.copy(lastPosition, scope.object.getPosition());
      lastZoom = scope.object.zoom;
    };

    // listeners

    function onPointerDown(event: PointerEvent) {
      if (scope.enabled === false) return;

      if (_pointers.length === 0) {
        scope.domElement.setPointerCapture(event.pointerId);

        scope.domElement.addEventListener("pointermove", onPointerMove);
        scope.domElement.addEventListener("pointerup", onPointerUp);
      }

      //

      addPointer(event);

      if (event.pointerType === "touch") {
        onTouchStart(event);
      } else {
        onMouseDown(event);
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (scope.enabled === false) return;

      if (event.pointerType === "touch") {
        onTouchMove(event);
      } else {
        onMouseMove(event);
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (scope.enabled === false) return;

      if (event.pointerType === "touch") {
        onTouchEnd(event);
      } else {
        onMouseUp();
      }

      //

      removePointer(event);

      if (_pointers.length === 0) {
        scope.domElement.releasePointerCapture(event.pointerId);

        scope.domElement.removeEventListener("pointermove", onPointerMove);
        scope.domElement.removeEventListener("pointerup", onPointerUp);
      }
    }

    function onPointerCancel(event: PointerEvent) {
      removePointer(event);
    }

    function keydown(event: KeyboardEvent) {
      if (scope.enabled === false) return;

      window.removeEventListener("keydown", keydown);

      if (_keyState !== STATE.NONE) {
        return;
      } else if (event.code === scope.keys[STATE.ROTATE] && !scope.noRotate) {
        _keyState = STATE.ROTATE;
      } else if (event.code === scope.keys[STATE.ZOOM] && !scope.noZoom) {
        _keyState = STATE.ZOOM;
      } else if (event.code === scope.keys[STATE.PAN] && !scope.noPan) {
        _keyState = STATE.PAN;
      }
    }

    function keyup() {
      if (scope.enabled === false) return;

      _keyState = STATE.NONE;

      window.addEventListener("keydown", keydown);
    }

    function onMouseDown(event: MouseEvent) {
      if (_state === STATE.NONE) {
        switch (event.button) {
          case scope.mouseButtons.LEFT:
            _state = STATE.ROTATE;
            break;

          case scope.mouseButtons.MIDDLE:
            _state = STATE.ZOOM;
            break;

          case scope.mouseButtons.RIGHT:
            _state = STATE.PAN;
            break;

          default:
            _state = STATE.NONE;
        }
      }

      const state = _keyState !== STATE.NONE ? _keyState : _state;

      if (state === STATE.ROTATE && !scope.noRotate) {
        vec2.copy(_moveCurr, getMouseOnCircle(event.pageX, event.pageY));
        vec2.copy(_movePrev, _moveCurr);
      } else if (state === STATE.ZOOM && !scope.noZoom) {
        vec2.copy(_zoomStart, getMouseOnScreen(event.pageX, event.pageY));
        vec2.copy(_zoomEnd, _zoomStart);
      } else if (state === STATE.PAN && !scope.noPan) {
        vec2.copy(_panStart, getMouseOnScreen(event.pageX, event.pageY));
        vec2.copy(_panEnd, _panStart);
      }

      //scope.dispatchEvent(_startEvent);
    }

    function onMouseMove(event: MouseEvent) {
      const state = _keyState !== STATE.NONE ? _keyState : _state;

      if (state === STATE.ROTATE && !scope.noRotate) {
        vec2.copy(_movePrev, _moveCurr);
        vec2.copy(_moveCurr, getMouseOnCircle(event.pageX, event.pageY));
      } else if (state === STATE.ZOOM && !scope.noZoom) {
        vec2.copy(_zoomEnd, getMouseOnScreen(event.pageX, event.pageY));
      } else if (state === STATE.PAN && !scope.noPan) {
        vec2.copy(_panEnd, getMouseOnScreen(event.pageX, event.pageY));
      }
    }

    function onMouseUp() {
      _state = STATE.NONE;

      //scope.dispatchEvent(_endEvent);
    }

    function onMouseWheel(event: WheelEvent) {
      if (scope.enabled === false) return;

      if (scope.noZoom === true) return;

      event.preventDefault();

      switch (event.deltaMode) {
        case 2:
          // Zoom in pages
          _zoomStart[1] -= event.deltaY * 0.025;
          break;

        case 1:
          // Zoom in lines
          _zoomStart[1] -= event.deltaY * 0.01;
          break;

        default:
          // undefined, 0, assume pixels
          _zoomStart[1] -= event.deltaY * 0.00025;
          break;
      }

      //scope.dispatchEvent(_startEvent);
      //scope.dispatchEvent(_endEvent);
    }

    function onTouchStart(event: PointerEvent) {
      trackPointer(event);

      switch (_pointers.length) {
        case 1:
          _state = STATE.TOUCH_ROTATE;
          vec2.copy(
            _moveCurr,
            getMouseOnCircle(_pointers[0].pageX, _pointers[0].pageY)
          );
          vec2.copy(_movePrev, _moveCurr);
          break;

        default:
          // 2 or more
          _state = STATE.TOUCH_ZOOM_PAN;
          const dx = _pointers[0].pageX - _pointers[1].pageX;
          const dy = _pointers[0].pageY - _pointers[1].pageY;
          _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt(
            dx * dx + dy * dy
          );

          const x = (_pointers[0].pageX + _pointers[1].pageX) / 2;
          const y = (_pointers[0].pageY + _pointers[1].pageY) / 2;
          vec2.copy(_panStart, getMouseOnScreen(x, y));
          vec2.copy(_panEnd, _panStart);
          break;
      }

      //scope.dispatchEvent(_startEvent);
    }

    function onTouchMove(event: PointerEvent) {
      trackPointer(event);

      switch (_pointers.length) {
        case 1:
          vec2.copy(_movePrev, _moveCurr);
          vec2.copy(_moveCurr, getMouseOnCircle(event.pageX, event.pageY));
          break;

        default:
          // 2 or more

          const position = getSecondPointerPosition(event);

          const dx = event.pageX - position[0];
          const dy = event.pageY - position[1];
          _touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);

          const x = (event.pageX + position[0]) / 2;
          const y = (event.pageY + position[1]) / 2;
          vec2.copy(_panEnd, getMouseOnScreen(x, y));
          break;
      }
    }

    function onTouchEnd(event: PointerEvent) {
      switch (_pointers.length) {
        case 0:
          _state = STATE.NONE;
          break;

        case 1:
          _state = STATE.TOUCH_ROTATE;
          vec2.copy(_moveCurr, getMouseOnCircle(event.pageX, event.pageY));
          vec2.copy(_movePrev, _moveCurr);
          break;

        case 2:
          _state = STATE.TOUCH_ZOOM_PAN;
          vec2.copy(
            _moveCurr,
            getMouseOnCircle(
              event.pageX - _movePrev[0],
              event.pageY - _movePrev[1]
            )
          );
          vec2.copy(_movePrev, _moveCurr);
          break;
      }

      //scope.dispatchEvent(_endEvent);
    }

    function contextmenu(event: Event) {
      if (scope.enabled === false) return;

      event.preventDefault();
    }

    function addPointer(event: PointerEvent) {
      _pointers.push(event);
    }

    function removePointer(event: PointerEvent) {
      delete _pointerPositions[event.pointerId];

      for (let i = 0; i < _pointers.length; i++) {
        if (_pointers[i].pointerId == event.pointerId) {
          _pointers.splice(i, 1);
          return;
        }
      }
    }

    function trackPointer(event: PointerEvent) {
      let position = _pointerPositions[event.pointerId];

      if (position === undefined) {
        position = vec2.fromValues(0, 0);
        _pointerPositions[event.pointerId] = position;
      }

      vec2.set(position, event.pageX, event.pageY);
    }

    function getSecondPointerPosition(event: PointerEvent) {
      const pointer =
        event.pointerId === _pointers[0].pointerId
          ? _pointers[1]
          : _pointers[0];

      return _pointerPositions[pointer.pointerId];
    }

    this.dispose = function () {
      scope.domElement.removeEventListener("contextmenu", contextmenu);

      scope.domElement.removeEventListener("pointerdown", onPointerDown);
      scope.domElement.removeEventListener("pointercancel", onPointerCancel);
      scope.domElement.removeEventListener("wheel", onMouseWheel);

      scope.domElement.removeEventListener("pointermove", onPointerMove);
      scope.domElement.removeEventListener("pointerup", onPointerUp);

      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };

    this.domElement.addEventListener("contextmenu", contextmenu);

    this.domElement.addEventListener("pointerdown", onPointerDown);
    this.domElement.addEventListener("pointercancel", onPointerCancel);
    this.domElement.addEventListener("wheel", onMouseWheel, { passive: false });

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);

    this.handleResize();

    // force an update at start
    this.update();
  }
}

export default TrackballControls;
