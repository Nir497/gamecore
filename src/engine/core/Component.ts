import type { Entity } from "./Entity";
import type { Scene } from "./Scene";

export abstract class Component {
  entity: Entity | null = null;

  onAttach(_entity: Entity): void {}

  onDetach(): void {}

  start(_scene: Scene): void {}

  update(_dt: number, _scene: Scene): void {}

  render2D(_ctx: CanvasRenderingContext2D, _scene: Scene): void {}

  dispose(): void {}
}
