// Keyboard + mouse input, with pointer lock for the third-person camera.
export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  const state = {
    keys,
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    locked: false,
    anyKey: false,
  };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    justPressed.add(event.code);
    state.anyKey = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!state.locked) return;
    state.mouseDX += event.movementX || 0;
    state.mouseDY += event.movementY || 0;
  }
  function onMouseDown(event) {
    if (event.button === 0) state.mouseDown = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.mouseDown = false;
  }
  function onLockChange() {
    state.locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  function lockPointer() {
    if (!state.locked && canvas.requestPointerLock) {
      try {
        canvas.requestPointerLock();
      } catch (error) {
        // Pointer lock is a nicety; the game still plays with drag-look.
      }
    }
  }

  /** Movement intent in camera space: forward/right in [-1, 1]. */
  function moveVector() {
    let f = 0;
    let r = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
    return { f, r };
  }

  function consumeMouse() {
    const dx = state.mouseDX;
    const dy = state.mouseDY;
    state.mouseDX = 0;
    state.mouseDY = 0;
    return { dx, dy };
  }

  function pressed(code) {
    return keys.has(code);
  }

  /** True once per physical press, whenever the next step asks: a quick tap
   * between two frames is never lost, and holding the key fires only once. */
  function takePressed(code) {
    if (!justPressed.has(code)) return false;
    justPressed.delete(code);
    return true;
  }

  /** Drop queued presses (used when pausing, so a tap during the pause
   * does not fire the moment play resumes). */
  function clearPressed() {
    justPressed.clear();
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('pointerlockchange', onLockChange);
  }

  return { state, moveVector, consumeMouse, pressed, takePressed, clearPressed, lockPointer, dispose };
}
