import { describe, expect, it } from "vitest";
import { BotScheduler, Entity, EntityPool, rectsOverlap, SpatialHashGrid, Time } from "../src/engine";

describe("Time", () => {
  it("caps large frame deltas", () => {
    const time = new Time();
    time.tick(1000);
    const delta = time.tick(5000);
    expect(delta).toBe(0.1);
  });
});

describe("collision", () => {
  it("detects overlapping rectangles", () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(false);
  });
});

describe("SpatialHashGrid", () => {
  it("returns items near a query bounds", () => {
    const grid = new SpatialHashGrid<Entity>(32);
    const entity = new Entity("Test");
    grid.insert(entity, { x: 10, y: 10, width: 8, height: 8 });
    expect(grid.query({ x: 0, y: 0, width: 20, height: 20 })).toContain(entity);
  });
});

describe("EntityPool", () => {
  it("reuses released objects", () => {
    const pool = new EntityPool(() => ({ active: false, value: 1 }));
    const first = pool.acquire();
    pool.release(first);
    const second = pool.acquire();
    expect(second).toBe(first);
  });
});

describe("BotScheduler", () => {
  it("updates only the configured number of bots per frame", () => {
    const bots = Array.from({ length: 5 }, () => ({
      active: true,
      updates: 0,
      updateBot() {
        this.updates += 1;
      }
    }));
    const scheduler = new BotScheduler<(typeof bots)[number]>(2);
    scheduler.update(bots, 1 / 60);
    expect(bots.reduce((total, bot) => total + bot.updates, 0)).toBe(2);
  });
});
