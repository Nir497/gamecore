export class InputManager {
  private keysDown = new Set<string>();
  private keysPressed = new Set<string>();
  private keysReleased = new Set<string>();
  private buttonsDown = new Set<number>();
  private buttonsPressed = new Set<number>();
  private buttonsReleased = new Set<number>();
  pointer = { x: 0, y: 0, movementX: 0, movementY: 0, locked: false };

  constructor(private readonly target: HTMLElement | Window = window) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
  }

  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  wasKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  wasKeyReleased(code: string): boolean {
    return this.keysReleased.has(code);
  }

  isMouseDown(button: number): boolean {
    return this.buttonsDown.has(button);
  }

  wasMousePressed(button: number): boolean {
    return this.buttonsPressed.has(button);
  }

  wasMouseReleased(button: number): boolean {
    return this.buttonsReleased.has(button);
  }

  async requestPointerLock(): Promise<void> {
    if (!(this.target instanceof HTMLElement)) {
      return;
    }
    await this.target.requestPointerLock();
  }

  exitPointerLock(): void {
    document.exitPointerLock();
  }

  endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.buttonsPressed.clear();
    this.buttonsReleased.clear();
    this.pointer.movementX = 0;
    this.pointer.movementY = 0;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.keysDown.has(event.code)) {
      this.keysPressed.add(event.code);
    }
    this.keysDown.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keysDown.delete(event.code);
    this.keysReleased.add(event.code);
  };

  private onMouseMove = (event: MouseEvent): void => {
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointer.movementX += event.movementX;
    this.pointer.movementY += event.movementY;
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.buttonsDown.has(event.button)) {
      this.buttonsPressed.add(event.button);
    }
    this.buttonsDown.add(event.button);
  };

  private onMouseUp = (event: MouseEvent): void => {
    this.buttonsDown.delete(event.button);
    this.buttonsReleased.add(event.button);
  };

  private onPointerLockChange = (): void => {
    this.pointer.locked = document.pointerLockElement === this.target;
  };
}
