export class Time {
  delta = 0;
  elapsed = 0;
  frame = 0;
  maxDelta = 0.1;
  fixedStep = 1 / 60;
  private accumulator = 0;
  private last = 0;

  tick(nowMs: number): number {
    const now = nowMs / 1000;
    if (this.last === 0) {
      this.last = now;
    }
    this.delta = Math.min(now - this.last, this.maxDelta);
    this.elapsed += this.delta;
    this.accumulator += this.delta;
    this.last = now;
    this.frame += 1;
    return this.delta;
  }

  consumeFixedStep(): boolean {
    if (this.accumulator < this.fixedStep) {
      return false;
    }
    this.accumulator -= this.fixedStep;
    return true;
  }

  reset(): void {
    this.delta = 0;
    this.elapsed = 0;
    this.frame = 0;
    this.accumulator = 0;
    this.last = 0;
  }
}
