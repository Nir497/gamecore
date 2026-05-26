import type { Bounds } from "../core/SpatialHashGrid";

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export function rectsOverlap(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const radius = a.radius + b.radius;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= radius * radius;
}

export function pointInRect(x: number, y: number, rect: Bounds): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
