import "../../shared/page.css";
import { createGame, Entity, Scene } from "../../../src/engine";

class Blank2DScene extends Scene {
  private marker = new Entity("Marker", { x: 480, y: 270 });

  override start(): void {
    this.add(this.marker);
  }

  override update(dt: number): void {
    const speed = 220;
    const input = this.game.input;
    if (input.isKeyDown("ArrowLeft") || input.isKeyDown("KeyA")) this.marker.transform.x -= speed * dt;
    if (input.isKeyDown("ArrowRight") || input.isKeyDown("KeyD")) this.marker.transform.x += speed * dt;
    if (input.isKeyDown("ArrowUp") || input.isKeyDown("KeyW")) this.marker.transform.y -= speed * dt;
    if (input.isKeyDown("ArrowDown") || input.isKeyDown("KeyS")) this.marker.transform.y += speed * dt;
  }

  override render2D(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#f7c948";
    ctx.beginPath();
    ctx.arc(this.marker.transform.x, this.marker.transform.y, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#eef2f8";
    ctx.font = "18px Arial";
    ctx.fillText("Blank 2D template - move with WASD or arrows", 24, 36);
  }
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  if (!canvas) {
    throw new Error("Missing #game canvas.");
  }

  const game = createGame({
    canvas,
    width: 960,
    height: 540,
    background: "#141923",
    pixelArt: true
  });

  await game.setScene(new Blank2DScene());
  game.start();
}

void main();
