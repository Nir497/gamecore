export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SpatialHashGrid<T> {
  private buckets = new Map<string, Set<T>>();
  private itemBounds = new Map<T, Bounds>();

  constructor(readonly cellSize = 64) {}

  clear(): void {
    this.buckets.clear();
    this.itemBounds.clear();
  }

  insert(item: T, bounds: Bounds): void {
    this.remove(item);
    this.itemBounds.set(item, bounds);
    for (const key of this.keysFor(bounds)) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new Set<T>();
        this.buckets.set(key, bucket);
      }
      bucket.add(item);
    }
  }

  remove(item: T): void {
    const bounds = this.itemBounds.get(item);
    if (!bounds) {
      return;
    }
    for (const key of this.keysFor(bounds)) {
      this.buckets.get(key)?.delete(item);
    }
    this.itemBounds.delete(item);
  }

  query(bounds: Bounds): T[] {
    const result = new Set<T>();
    for (const key of this.keysFor(bounds)) {
      const bucket = this.buckets.get(key);
      if (!bucket) {
        continue;
      }
      for (const item of bucket) {
        result.add(item);
      }
    }
    return [...result];
  }

  private keysFor(bounds: Bounds): string[] {
    const minX = Math.floor(bounds.x / this.cellSize);
    const minY = Math.floor(bounds.y / this.cellSize);
    const maxX = Math.floor((bounds.x + bounds.width) / this.cellSize);
    const maxY = Math.floor((bounds.y + bounds.height) / this.cellSize);
    const keys: string[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        keys.push(`${x}:${y}`);
      }
    }
    return keys;
  }
}
