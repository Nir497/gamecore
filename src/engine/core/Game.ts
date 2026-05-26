import { AssetLoader } from "../assets/AssetLoader";
import { AudioManager } from "../audio/AudioManager";
import { InputManager } from "../input/InputManager";
import { Canvas2DRenderer } from "../rendering/Canvas2DRenderer";
import { Time } from "./Time";
import type { Scene } from "./Scene";

export interface GameConfig {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  background?: string;
  pixelArt?: boolean;
  fixedUpdate?: boolean;
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly renderer2D: Canvas2DRenderer;
  readonly input: InputManager;
  readonly assets = new AssetLoader();
  readonly audio = new AudioManager();
  readonly time = new Time();
  background: string;
  fixedUpdate: boolean;
  private scene: Scene | null = null;
  private running = false;
  private animationFrame = 0;

  constructor(config: GameConfig) {
    this.canvas = config.canvas;
    this.canvas.width = config.width ?? 960;
    this.canvas.height = config.height ?? 540;
    this.background = config.background ?? "#101318";
    this.fixedUpdate = config.fixedUpdate ?? false;
    this.renderer2D = new Canvas2DRenderer(this.canvas, {
      pixelArt: config.pixelArt ?? false
    });
    this.input = new InputManager(this.canvas);
  }

  async setScene(scene: Scene): Promise<void> {
    this.scene?.dispose();
    this.scene = scene;
    scene.game = this;
    await scene.preload();
    scene.internalStart();
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
  }

  dispose(): void {
    this.stop();
    this.scene?.dispose();
    this.input.dispose();
    this.audio.dispose();
  }

  private loop = (now: number): void => {
    const dt = this.time.tick(now);
    if (this.fixedUpdate) {
      while (this.time.consumeFixedStep()) {
        this.scene?.internalUpdate(this.time.fixedStep);
      }
    } else {
      this.scene?.internalUpdate(dt);
    }

    this.renderer2D.clear(this.background);
    const ctx = this.renderer2D.ctx;
    this.scene?.internalRender2D(ctx);
    this.input.endFrame();

    if (this.running) {
      this.animationFrame = requestAnimationFrame(this.loop);
    }
  };
}

export function createGame(config: GameConfig): Game {
  return new Game(config);
}
