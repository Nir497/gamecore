import "./styles.css";
import { createGame, Scene } from "../../../src/engine";

type Direction = "up" | "down" | "left" | "right" | "none";
type GhostMode = "scatter" | "chase" | "frightened" | "eyes";
type Tile = { x: number; y: number };
type Actor = {
  tile: Tile;
  start: Tile;
  direction: Direction;
  nextDirection: Direction;
  progress: number;
};
type Ghost = Actor & {
  name: "blinky" | "pinky" | "inky" | "clyde";
  color: string;
  mode: GhostMode;
  scatterTarget: Tile;
  eaten: boolean;
};

const tileSize = 32;
const boardOffsetX = 0;
const boardOffsetY = 56;
const columns = 28;
const rows = 31;
const width = columns * tileSize;
const height = 1120;
const powerPelletScore = 50;
const dotScore = 10;
const ghostScores = [200, 400, 800, 1600];
const fruitScores = [100, 300, 500, 700, 1000, 2000, 3000, 5000];

const mazeRows = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "######.##### ## #####.######",
  "######.##          ##.######",
  "######.## ###--### ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "######.## ######## ##.######",
  "######.##          ##.######",
  "######.## ######## ##.######",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
  "############################"
];

const directions: Record<Direction, Tile> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 }
};

const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
  none: "none"
};

class PacmanScene extends Scene {
  private walls = new Set<string>();
  private dots = new Set<string>();
  private powerPellets = new Set<string>();
  private totalPellets = 0;
  private score = 0;
  private highScore = Number(localStorage.getItem("gamecore-pacman-high-score") ?? 0);
  private level = 1;
  private lives = 3;
  private dotsEaten = 0;
  private extraLifeAwarded = false;
  private running = false;
  private roundMessage = "SPACE TO START";
  private messageTimer = 0;
  private frightenedTimer = 0;
  private ghostCombo = 0;
  private mode: "scatter" | "chase" = "scatter";
  private modeTimer = 7;
  private fruit: Tile | null = null;
  private fruitTimer = 0;
  private fruitSpawnedAt = new Set<number>();
  private pacman: Actor = this.createPacman();
  private ghosts: Ghost[] = this.createGhosts();

  override start(): void {
    this.resetBoard();
  }

  override update(dt: number): void {
    this.readInput();
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.fruitTimer = Math.max(0, this.fruitTimer - dt);
    if (this.fruitTimer === 0) {
      this.fruit = null;
    }

    if (!this.running) {
      return;
    }

    this.updateModes(dt);
    this.movePacman(dt);
    this.collectAtPacman();
    this.updateGhosts(dt);
    this.checkGhostCollisions();

    if (this.totalPellets === 0) {
      this.level += 1;
      this.running = false;
      this.roundMessage = "LEVEL CLEAR";
      this.messageTimer = 1.2;
      window.setTimeout(() => {
        this.resetBoard();
        this.roundMessage = "SPACE TO START";
      }, 900);
    }
  }

  override render2D(ctx: CanvasRenderingContext2D): void {
    this.drawBackground(ctx);
    this.drawHud(ctx);
    this.drawMaze(ctx);
    this.drawPellets(ctx);
    this.drawFruit(ctx);
    for (const ghost of this.ghosts) {
      this.drawGhost(ctx, ghost);
    }
    this.drawPacman(ctx);
    this.drawFooter(ctx);
    this.drawMessage(ctx);
  }

  private resetBoard(): void {
    this.walls.clear();
    this.dots.clear();
    this.powerPellets.clear();
    this.fruitSpawnedAt.clear();
    this.fruit = null;
    this.fruitTimer = 0;
    this.dotsEaten = 0;
    this.totalPellets = 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const cell = mazeRows[y][x];
        const key = this.key(x, y);
        if (cell === "#") {
          this.walls.add(key);
        } else if (cell === ".") {
          this.dots.add(key);
          this.totalPellets += 1;
        } else if (cell === "o") {
          this.powerPellets.add(key);
          this.totalPellets += 1;
        }
      }
    }
    this.pacman = this.createPacman();
    this.ghosts = this.createGhosts();
    this.mode = "scatter";
    this.modeTimer = 7;
    this.frightenedTimer = 0;
    this.ghostCombo = 0;
  }

  private resetLife(): void {
    this.running = false;
    this.roundMessage = this.lives > 0 ? "SPACE TO START" : "GAME OVER";
    this.pacman = this.createPacman();
    this.ghosts = this.createGhosts();
    this.mode = "scatter";
    this.modeTimer = 7;
    this.frightenedTimer = 0;
    this.ghostCombo = 0;
    if (this.lives === 0) {
      this.level = 1;
      this.lives = 3;
      this.score = 0;
      this.extraLifeAwarded = false;
      this.resetBoard();
      this.roundMessage = "GAME OVER";
      this.messageTimer = 1.5;
    }
  }

  private readInput(): void {
    const input = this.game.input;
    if (input.wasKeyPressed("Space")) {
      if (!this.running) {
        this.running = true;
        this.roundMessage = "";
      }
    }
    if (input.isKeyDown("ArrowLeft") || input.isKeyDown("KeyA")) this.pacman.nextDirection = "left";
    if (input.isKeyDown("ArrowRight") || input.isKeyDown("KeyD")) this.pacman.nextDirection = "right";
    if (input.isKeyDown("ArrowUp") || input.isKeyDown("KeyW")) this.pacman.nextDirection = "up";
    if (input.isKeyDown("ArrowDown") || input.isKeyDown("KeyS")) this.pacman.nextDirection = "down";
  }

  private updateModes(dt: number): void {
    if (this.frightenedTimer > 0) {
      this.frightenedTimer = Math.max(0, this.frightenedTimer - dt);
      if (this.frightenedTimer === 0) {
        this.ghostCombo = 0;
        for (const ghost of this.ghosts) {
          if (ghost.mode === "frightened") ghost.mode = this.mode;
        }
      }
    }

    this.modeTimer -= dt;
    if (this.modeTimer <= 0) {
      this.mode = this.mode === "scatter" ? "chase" : "scatter";
      this.modeTimer = this.mode === "scatter" ? Math.max(4, 7 - this.level * 0.25) : 20;
      for (const ghost of this.ghosts) {
        if (ghost.mode !== "frightened" && ghost.mode !== "eyes") {
          ghost.mode = this.mode;
          ghost.direction = opposite[ghost.direction];
        }
      }
    }
  }

  private movePacman(dt: number): void {
    this.moveActor(this.pacman, dt * this.pacmanSpeed(), () => this.pacman.nextDirection);
  }

  private updateGhosts(dt: number): void {
    for (const ghost of this.ghosts) {
      const speed = ghost.mode === "frightened" ? 4.2 : ghost.mode === "eyes" ? 10 : this.ghostSpeed(ghost);
      this.moveActor(ghost, dt * speed, () => this.chooseGhostDirection(ghost));
      if (ghost.mode === "eyes" && ghost.tile.x === ghost.start.x && ghost.tile.y === ghost.start.y) {
        ghost.mode = this.mode;
        ghost.eaten = false;
      }
    }
  }

  private moveActor(actor: Actor, distance: number, chooseDirection: () => Direction): void {
    let remaining = distance;
    while (remaining > 0) {
      if (actor.progress === 0) {
        const desired = chooseDirection();
        if (desired !== "none" && this.canMove(actor.tile, desired)) {
          actor.direction = desired;
        } else if (!this.canMove(actor.tile, actor.direction)) {
          actor.direction = "none";
        }
      }
      if (actor.direction === "none") {
        return;
      }
      const step = Math.min(1 - actor.progress, remaining);
      actor.progress += step;
      remaining -= step;
      if (actor.progress >= 1) {
        actor.tile = this.nextTile(actor.tile, actor.direction);
        actor.tile = this.wrap(actor.tile);
        actor.progress = 0;
      }
    }
  }

  private chooseGhostDirection(ghost: Ghost): Direction {
    if (ghost.mode === "frightened") {
      const options = this.validDirections(ghost).filter((direction) => direction !== opposite[ghost.direction]);
      return options[Math.floor(Math.random() * options.length)] ?? opposite[ghost.direction];
    }
    const target = this.ghostExitTarget(ghost) ?? (
      ghost.mode === "eyes" ? ghost.start : ghost.mode === "scatter" ? ghost.scatterTarget : this.chaseTarget(ghost)
    );
    const options = this.validDirections(ghost).filter((direction) => direction !== opposite[ghost.direction]);
    const viable = options.length > 0 ? options : this.validDirections(ghost);
    return viable.reduce((best, direction) => {
      const tile = this.nextTile(ghost.tile, direction);
      return this.distance(tile, target) < this.distance(this.nextTile(ghost.tile, best), target) ? direction : best;
    }, viable[0] ?? "none");
  }

  private chaseTarget(ghost: Ghost): Tile {
    if (ghost.name === "blinky") {
      return { ...this.pacman.tile };
    }
    if (ghost.name === "pinky") {
      const ahead = this.offsetFrom(this.pacman.tile, this.pacman.direction, 4);
      return this.pacman.direction === "up" ? { x: ahead.x - 4, y: ahead.y } : ahead;
    }
    if (ghost.name === "inky") {
      const blinky = this.ghosts.find((other) => other.name === "blinky") ?? ghost;
      const ahead = this.offsetFrom(this.pacman.tile, this.pacman.direction, 2);
      return { x: ahead.x + (ahead.x - blinky.tile.x), y: ahead.y + (ahead.y - blinky.tile.y) };
    }
    return this.distance(ghost.tile, this.pacman.tile) > 8 ? { ...this.pacman.tile } : ghost.scatterTarget;
  }

  private ghostExitTarget(ghost: Ghost): Tile | null {
    if (ghost.mode === "eyes") {
      return null;
    }
    const inHouse = ghost.tile.x >= 11 && ghost.tile.x <= 16 && ghost.tile.y >= 12 && ghost.tile.y <= 15;
    return inHouse ? { x: 13, y: 11 } : null;
  }

  private collectAtPacman(): void {
    const key = this.key(this.pacman.tile.x, this.pacman.tile.y);
    if (this.dots.delete(key)) {
      this.addScore(dotScore);
      this.dotsEaten += 1;
      this.totalPellets -= 1;
      this.maybeSpawnFruit();
    }
    if (this.powerPellets.delete(key)) {
      this.addScore(powerPelletScore);
      this.dotsEaten += 1;
      this.totalPellets -= 1;
      this.frightenedTimer = this.frightenedDuration();
      this.ghostCombo = 0;
      for (const ghost of this.ghosts) {
        if (ghost.mode !== "eyes") {
          ghost.mode = "frightened";
          ghost.direction = opposite[ghost.direction];
        }
      }
    }
    if (this.fruit && this.fruit.x === this.pacman.tile.x && this.fruit.y === this.pacman.tile.y) {
      this.addScore(fruitScores[Math.min(this.level - 1, fruitScores.length - 1)]);
      this.fruit = null;
      this.fruitTimer = 0;
    }
  }

  private checkGhostCollisions(): void {
    for (const ghost of this.ghosts) {
      if (ghost.tile.x !== this.pacman.tile.x || ghost.tile.y !== this.pacman.tile.y) {
        continue;
      }
      if (ghost.mode === "frightened") {
        const points = ghostScores[Math.min(this.ghostCombo, ghostScores.length - 1)];
        this.addScore(points);
        this.ghostCombo += 1;
        ghost.mode = "eyes";
        ghost.eaten = true;
        ghost.direction = "up";
        ghost.progress = 0;
      } else if (ghost.mode !== "eyes") {
        this.lives -= 1;
        this.roundMessage = this.lives > 0 ? "READY" : "GAME OVER";
        this.messageTimer = 1.2;
        this.resetLife();
        break;
      }
    }
  }

  private maybeSpawnFruit(): void {
    if ((this.dotsEaten === 70 || this.dotsEaten === 170) && !this.fruitSpawnedAt.has(this.dotsEaten)) {
      this.fruitSpawnedAt.add(this.dotsEaten);
      this.fruit = { x: 13, y: 22 };
      this.fruitTimer = 8;
    }
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("gamecore-pacman-high-score", String(this.highScore));
    }
    if (!this.extraLifeAwarded && this.score >= 10000) {
      this.lives = Math.min(6, this.lives + 1);
      this.extraLifeAwarded = true;
    }
  }

  private createPacman(): Actor {
    return {
      tile: { x: 13, y: 23 },
      start: { x: 13, y: 23 },
      direction: "left",
      nextDirection: "left",
      progress: 0
    };
  }

  private createGhosts(): Ghost[] {
    return [
      this.createGhost("blinky", "#ff3f5f", { x: 13, y: 11 }, { x: 26, y: -2 }, "left"),
      this.createGhost("pinky", "#ff7bd5", { x: 13, y: 14 }, { x: 1, y: -2 }, "up"),
      this.createGhost("inky", "#40e0ff", { x: 12, y: 14 }, { x: 26, y: 32 }, "up"),
      this.createGhost("clyde", "#ffad42", { x: 15, y: 14 }, { x: 1, y: 32 }, "up")
    ];
  }

  private createGhost(
    name: Ghost["name"],
    color: string,
    start: Tile,
    scatterTarget: Tile,
    direction: Direction
  ): Ghost {
    return {
      name,
      color,
      tile: { ...start },
      start: { ...start },
      scatterTarget,
      direction,
      nextDirection: direction,
      progress: 0,
      mode: this.mode,
      eaten: false
    };
  }

  private pacmanSpeed(): number {
    if (this.level === 1) return 6.4;
    if (this.level <= 4) return 7.2;
    if (this.level <= 20) return 8;
    return 7.2;
  }

  private ghostSpeed(ghost: Ghost): number {
    const base = this.level === 1 ? 6 : this.level <= 4 ? 6.8 : 7.6;
    if (ghost.name === "blinky" && this.totalPellets < 35) return base + 1.1;
    if (ghost.name === "blinky" && this.totalPellets < 70) return base + 0.6;
    return base;
  }

  private frightenedDuration(): number {
    if (this.level === 1) return 6;
    if (this.level <= 4) return 6 - this.level;
    if (this.level <= 6) return 2;
    if (this.level <= 12) return 1;
    return 0.15;
  }

  private canMove(tile: Tile, direction: Direction): boolean {
    if (direction === "none") return false;
    const next = this.wrap(this.nextTile(tile, direction));
    return !this.walls.has(this.key(next.x, next.y));
  }

  private validDirections(actor: Actor): Direction[] {
    return (["up", "down", "left", "right"] as Direction[]).filter((direction) => this.canMove(actor.tile, direction));
  }

  private nextTile(tile: Tile, direction: Direction): Tile {
    const vector = directions[direction];
    return { x: tile.x + vector.x, y: tile.y + vector.y };
  }

  private offsetFrom(tile: Tile, direction: Direction, count: number): Tile {
    const vector = directions[direction];
    return { x: tile.x + vector.x * count, y: tile.y + vector.y * count };
  }

  private wrap(tile: Tile): Tile {
    if (tile.x < 0) return { x: columns - 1, y: tile.y };
    if (tile.x >= columns) return { x: 0, y: tile.y };
    return tile;
  }

  private distance(a: Tile, b: Tile): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private actorPosition(actor: Actor): { x: number; y: number } {
    const vector = directions[actor.direction];
    return {
      x: boardOffsetX + (actor.tile.x + 0.5 + vector.x * actor.progress) * tileSize,
      y: boardOffsetY + (actor.tile.y + 0.5 + vector.y * actor.progress) * tileSize
    };
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#111720");
    gradient.addColorStop(0.45, "#070a11");
    gradient.addColorStop(1, "#09080f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#f7f3d0";
    ctx.font = "700 24px Inter, Arial";
    ctx.textBaseline = "top";
    ctx.fillText(`SCORE ${this.score.toString().padStart(6, "0")}`, 24, 18);
    ctx.fillText(`HIGH ${this.highScore.toString().padStart(6, "0")}`, 328, 18);
    ctx.fillText(`LV ${this.level}`, 716, 18);
  }

  private drawMaze(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(boardOffsetX, boardOffsetY);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        if (!this.walls.has(this.key(x, y))) continue;
        const px = x * tileSize;
        const py = y * tileSize;
        const glow = ctx.createLinearGradient(px, py, px + tileSize, py + tileSize);
        glow.addColorStop(0, "#294cff");
        glow.addColorStop(1, "#00c2ff");
        ctx.fillStyle = "#091532";
        ctx.fillRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
        ctx.strokeStyle = glow;
        ctx.lineWidth = 3;
        ctx.strokeRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
      }
    }
    ctx.restore();
  }

  private drawPellets(ctx: CanvasRenderingContext2D): void {
    const pulse = 0.5 + Math.sin(performance.now() / 140) * 0.5;
    ctx.fillStyle = "#ffe9a6";
    for (const dot of this.dots) {
      const [x, y] = dot.split(",").map(Number);
      ctx.beginPath();
      ctx.arc((x + 0.5) * tileSize, boardOffsetY + (y + 0.5) * tileSize, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pellet of this.powerPellets) {
      const [x, y] = pellet.split(",").map(Number);
      ctx.fillStyle = "#fff6cf";
      ctx.beginPath();
      ctx.arc((x + 0.5) * tileSize, boardOffsetY + (y + 0.5) * tileSize, 8 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFruit(ctx: CanvasRenderingContext2D): void {
    if (!this.fruit) return;
    const x = (this.fruit.x + 0.5) * tileSize;
    const y = boardOffsetY + (this.fruit.y + 0.5) * tileSize;
    ctx.fillStyle = "#ff365d";
    ctx.beginPath();
    ctx.arc(x - 5, y + 2, 8, 0, Math.PI * 2);
    ctx.arc(x + 5, y + 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#67f087";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.quadraticCurveTo(x + 4, y - 17, x + 15, y - 16);
    ctx.stroke();
  }

  private drawPacman(ctx: CanvasRenderingContext2D): void {
    const position = this.actorPosition(this.pacman);
    const angle = this.directionAngle(this.pacman.direction);
    const mouth = 0.2 + Math.abs(Math.sin(performance.now() / 90)) * 0.46;
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffd83d";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 14, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, ghost: Ghost): void {
    const position = this.actorPosition(ghost);
    const flashing = ghost.mode === "frightened" && this.frightenedTimer < 2 && Math.floor(performance.now() / 140) % 2 === 0;
    const bodyColor = ghost.mode === "eyes" ? "transparent" : ghost.mode === "frightened" ? (flashing ? "#f8fbff" : "#244bff") : ghost.color;
    ctx.save();
    ctx.translate(position.x, position.y);
    if (ghost.mode !== "eyes") {
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(0, -4, 14, Math.PI, 0);
      ctx.lineTo(14, 13);
      for (let i = 0; i < 4; i += 1) {
        ctx.lineTo(7 - i * 7, i % 2 === 0 ? 7 : 13);
      }
      ctx.lineTo(-14, 13);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-5, -4, 4, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -4, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ghost.mode === "frightened" ? "#17235f" : "#111827";
    const look = directions[ghost.direction];
    ctx.beginPath();
    ctx.arc(-5 + look.x * 1.8, -4 + look.y * 1.8, 2, 0, Math.PI * 2);
    ctx.arc(6 + look.x * 1.8, -4 + look.y * 1.8, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawFooter(ctx: CanvasRenderingContext2D): void {
    const y = boardOffsetY + rows * tileSize + 4;
    ctx.fillStyle = "#ffd83d";
    for (let i = 0; i < this.lives; i += 1) {
      ctx.beginPath();
      ctx.moveTo(28 + i * 28, y + 19);
      ctx.arc(28 + i * 28, y + 19, 11, 0.22, Math.PI * 2 - 0.22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#9fb7d9";
    ctx.font = "700 16px Inter, Arial";
    ctx.textAlign = "right";
    ctx.fillText("WASD / ARROWS", width - 28, y + 10);
    ctx.textAlign = "left";
  }

  private drawMessage(ctx: CanvasRenderingContext2D): void {
    const text = this.roundMessage || (this.running ? "" : "SPACE TO START");
    if (!text && this.messageTimer <= 0) return;
    ctx.save();
    ctx.fillStyle = "rgba(6, 9, 16, 0.72)";
    ctx.fillRect(224, boardOffsetY + 392, 448, 88);
    ctx.strokeStyle = "#ffd83d";
    ctx.lineWidth = 2;
    ctx.strokeRect(232, boardOffsetY + 400, 432, 72);
    ctx.fillStyle = "#fff6cf";
    ctx.font = "800 30px Inter, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, boardOffsetY + 436);
    ctx.restore();
  }

  private directionAngle(direction: Direction): number {
    if (direction === "left") return Math.PI;
    if (direction === "up") return -Math.PI / 2;
    if (direction === "down") return Math.PI / 2;
    return 0;
  }
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  if (!canvas) {
    throw new Error("Missing #game canvas.");
  }

  const game = createGame({
    canvas,
    width,
    height,
    background: "#070a11",
    pixelArt: false
  });

  await game.setScene(new PacmanScene());
  game.start();
}

void main();
