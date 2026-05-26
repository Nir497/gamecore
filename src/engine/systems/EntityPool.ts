export class EntityPool<T extends { active: boolean }> {
  private readonly items: T[] = [];

  constructor(private readonly createItem: () => T) {}

  acquire(): T {
    const item = this.items.find((candidate) => !candidate.active);
    if (item) {
      item.active = true;
      return item;
    }
    const created = this.createItem();
    created.active = true;
    this.items.push(created);
    return created;
  }

  release(item: T): void {
    item.active = false;
  }

  all(): readonly T[] {
    return this.items;
  }

  active(): T[] {
    return this.items.filter((item) => item.active);
  }
}
