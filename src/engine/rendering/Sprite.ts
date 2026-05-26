import { Component } from "../core/Component";

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SpriteRenderer extends Component {
  constructor(
    readonly image: HTMLImageElement,
    public frame: SpriteFrame | null = null,
    public width = frame?.width ?? image.width,
    public height = frame?.height ?? image.height
  ) {
    super();
  }

  override render2D(ctx: CanvasRenderingContext2D): void {
    if (!this.entity) {
      return;
    }
    const { x, y, rotation, scaleX, scaleY } = this.entity.transform;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scaleX, scaleY);
    if (this.frame) {
      ctx.drawImage(
        this.image,
        this.frame.x,
        this.frame.y,
        this.frame.width,
        this.frame.height,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height
      );
    } else {
      ctx.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
    }
    ctx.restore();
  }
}
