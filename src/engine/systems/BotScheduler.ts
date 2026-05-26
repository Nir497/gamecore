export interface BotLike {
  active: boolean;
  updateBot(dt: number): void;
}

export class BotScheduler<T extends BotLike> {
  private cursor = 0;

  constructor(public updatesPerFrame = 8) {}

  update(bots: T[], dt: number): void {
    if (bots.length === 0) {
      return;
    }
    const count = Math.min(this.updatesPerFrame, bots.length);
    for (let i = 0; i < count; i += 1) {
      const bot = bots[this.cursor % bots.length];
      this.cursor = (this.cursor + 1) % bots.length;
      if (bot.active) {
        bot.updateBot(dt);
      }
    }
  }
}
