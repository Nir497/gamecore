import type { Game } from "./Game";
import { Entity } from "./Entity";

export abstract class Scene {
  game!: Game;
  readonly entities: Entity[] = [];
  private started = false;

  async preload(): Promise<void> {}

  start(): void {}

  update(_dt: number): void {}

  render2D(_ctx: CanvasRenderingContext2D): void {}

  dispose(): void {
    for (const entity of this.entities) {
      entity.dispose();
    }
    this.entities.length = 0;
  }

  add(entity: Entity): Entity {
    this.entities.push(entity);
    if (this.started) {
      entity.start(this);
    }
    return entity;
  }

  remove(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index !== -1) {
      this.entities.splice(index, 1);
      entity.dispose();
    }
  }

  internalStart(): void {
    this.started = true;
    this.start();
    for (const entity of this.entities) {
      entity.start(this);
    }
  }

  internalUpdate(dt: number): void {
    this.update(dt);
    for (const entity of this.entities) {
      entity.update(dt, this);
    }
  }

  internalRender2D(ctx: CanvasRenderingContext2D): void {
    this.render2D(ctx);
    for (const entity of this.entities) {
      entity.render2D(ctx, this);
    }
  }
}
