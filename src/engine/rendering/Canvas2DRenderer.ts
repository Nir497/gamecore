export interface Canvas2DRendererOptions {
  pixelArt?: boolean;
}

export class Canvas2DRenderer {
  readonly ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement, options: Canvas2DRendererOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D is not supported in this browser.");
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = !options.pixelArt;
  }

  clear(color = "#000"): void {
    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }
}
