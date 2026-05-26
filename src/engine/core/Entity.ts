import { Component } from "./Component";
import type { Scene } from "./Scene";

export interface Transform2D {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

let nextEntityId = 1;

export class Entity {
  readonly id = nextEntityId++;
  name: string;
  active = true;
  tags = new Set<string>();
  transform: Transform2D;
  private components: Component[] = [];

  constructor(name = "Entity", transform: Partial<Transform2D> = {}) {
    this.name = name;
    this.transform = {
      x: transform.x ?? 0,
      y: transform.y ?? 0,
      rotation: transform.rotation ?? 0,
      scaleX: transform.scaleX ?? 1,
      scaleY: transform.scaleY ?? 1
    };
  }

  add<T extends Component>(component: T): T {
    component.entity = this;
    this.components.push(component);
    component.onAttach(this);
    return component;
  }

  get<T extends Component>(type: new (...args: never[]) => T): T | undefined {
    return this.components.find((component) => component instanceof type) as T | undefined;
  }

  remove(component: Component): void {
    const index = this.components.indexOf(component);
    if (index === -1) {
      return;
    }
    this.components.splice(index, 1);
    component.onDetach();
    component.entity = null;
  }

  start(scene: Scene): void {
    for (const component of this.components) {
      component.start(scene);
    }
  }

  update(dt: number, scene: Scene): void {
    if (!this.active) {
      return;
    }
    for (const component of this.components) {
      component.update(dt, scene);
    }
  }

  render2D(ctx: CanvasRenderingContext2D, scene: Scene): void {
    if (!this.active) {
      return;
    }
    for (const component of this.components) {
      component.render2D(ctx, scene);
    }
  }

  dispose(): void {
    for (const component of this.components) {
      component.dispose();
      component.entity = null;
    }
    this.components = [];
    this.tags.clear();
    this.active = false;
  }
}
