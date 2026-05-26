import "./styles.css";
import alienBruteUrl from "../assets/sprites/alien-brute.svg?url";
import alienHunterUrl from "../assets/sprites/alien-hunter.svg?url";
import alienScoutUrl from "../assets/sprites/alien-scout.svg?url";
import playerCannonUrl from "../assets/sprites/player-cannon.svg?url";
import { createGame, Scene } from "../../../src/engine";

type AlienKind = "squid" | "crab" | "octopus";
type ShotKind = "player" | "rolling" | "plunger" | "squiggly";

interface Alien {
  col: number;
  row: number;
  x: number;
  y: number;
  kind: AlienKind;
  points: number;
  alive: boolean;
  flash: number;
}

interface Shot {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  kind: ShotKind;
  wiggle: number;
}

interface Ufo {
  x: number;
  y: number;
  direction: number;
  active: boolean;
}

interface Shield {
  x: number;
  y: number;
  columns: number;
  rows: number;
  cell: number;
  cells: boolean[][];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const baseWidth = 900;
const height = 1080;
const groundY = 964;
const playerY = 938;
const playerWidth = 72;
const playerHeight = 28;
const alienWidth = 42;
const alienHeight = 30;
const alienGapX = 24;
const alienGapY = 28;
const alienStep = 12;
const alienDrop = 30;
const maxPlayerShots = 4;
const plungerColumns = [1, 7, 1, 1, 1, 4, 11, 1, 6, 3, 1, 1, 11, 9, 2, 8];
const squigglyColumns = [11, 1, 6, 3, 1, 1, 11, 9, 2, 8, 2, 11, 4, 7, 10];
const ufoScores = [50, 100, 150];

class SpaceInvadersScene extends Scene {
  private aliens: Alien[] = [];
  private shields: Shield[] = [];
  private enemyShots: Shot[] = [];
  private particles: Particle[] = [];
  private playerShots: Shot[] = [];
  private shotCooldown = 0;
  private ufo: Ufo = { x: -90, y: 96, direction: 1, active: false };
  private playerX = baseWidth / 2;
  private worldWidth = baseWidth;
  private viewportScale = 1;
  private score = 0;
  private highScore = Number(localStorage.getItem("gamecore-space-invaders-high-score") ?? 0);
  private lives = 3;
  private level = 1;
  private shotCount = 0;
  private extraLifeAwarded = false;
  private running = false;
  private gameOver = false;
  private message = "SPACE TO START";
  private alienDirection = 1;
  private alienFrame = 0;
  private alienMoveTimer = 0;
  private hitPause = 0;
  private enemyFireTimer = 1.4;
  private plungerIndex = 0;
  private squigglyIndex = 0;
  private rollingTimer = 2.1;
  private ufoTimer = 13;
  private waveFlash = 0;
  private playerExplosion = 0;
  private stars = Array.from({ length: 130 }, (_, index) => ({
    x: (index * 197) % baseWidth,
    y: (index * 89) % height,
    size: 1 + (index % 3) * 0.6,
    speed: 10 + (index % 5) * 4
  }));
  private alienSprites: Record<AlienKind, HTMLImageElement | null> = {
    squid: null,
    crab: null,
    octopus: null
  };
  private playerSprite: HTMLImageElement | null = null;

  override async preload(): Promise<void> {
    const [scout, hunter, brute, player] = await Promise.all([
      this.game.assets.image("space-invaders:alien-scout", alienScoutUrl),
      this.game.assets.image("space-invaders:alien-hunter", alienHunterUrl),
      this.game.assets.image("space-invaders:alien-brute", alienBruteUrl),
      this.game.assets.image("space-invaders:player-cannon", playerCannonUrl)
    ]);
    this.alienSprites = {
      squid: scout,
      crab: hunter,
      octopus: brute
    };
    this.playerSprite = player;
  }

  override start(): void {
    this.syncViewport();
    this.resetWave(true);
  }

  override update(dt: number): void {
    this.syncViewport();
    this.readInput(dt);
    this.updateStars(dt);
    this.updateParticles(dt);
    this.waveFlash = Math.max(0, this.waveFlash - dt);
    this.hitPause = Math.max(0, this.hitPause - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);

    if (!this.running && !this.playerExplosion) {
      return;
    }

    if (this.playerExplosion > 0) {
      this.playerExplosion = Math.max(0, this.playerExplosion - dt);
      this.updateAliens(dt);
      this.updateEnemyShots(dt);
      if (this.playerExplosion === 0) {
        this.finishRespawn();
      }
      return;
    }

    this.updatePlayerShot(dt);
    this.updateEnemyShots(dt);
    this.updateAliens(dt);
    this.updateUfo(dt);
    this.updateEnemyFire(dt);
    this.checkInvasion();

    if (this.aliveAliens().length === 0) {
      this.level += 1;
      this.message = "WAVE CLEAR";
      this.waveFlash = 0.8;
      window.setTimeout(() => {
        if (!this.gameOver) {
          this.resetWave(false);
          this.message = "";
          this.running = true;
        }
      }, 520);
      this.running = false;
    }
  }

  override render2D(ctx: CanvasRenderingContext2D): void {
    const viewportWidth = this.game.canvas.width;
    const viewportHeight = this.game.canvas.height;
    const scale = this.viewportScale;
    const offsetX = (viewportWidth - this.worldWidth * scale) / 2;
    const offsetY = (viewportHeight - height * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    this.drawBackground(ctx);
    this.drawHud(ctx);
    this.drawUfo(ctx);
    this.drawAliens(ctx);
    this.drawShields(ctx);
    this.drawShots(ctx);
    this.drawPlayer(ctx);
    this.drawGround(ctx);
    this.drawParticles(ctx);
    this.drawMessage(ctx);
    ctx.restore();
  }

  private readInput(dt: number): void {
    const input = this.game.input;
    if (input.wasKeyPressed("Space")) {
      if (this.gameOver) {
        this.restart();
      } else if (!this.running && this.playerExplosion === 0) {
        this.running = true;
        this.message = "";
      } else {
        this.firePlayerShot();
      }
    }

    if (!this.running || this.playerExplosion > 0) {
      return;
    }

    const left = input.isKeyDown("ArrowLeft") || input.isKeyDown("KeyA");
    const right = input.isKeyDown("ArrowRight") || input.isKeyDown("KeyD");
    const move = (right ? 1 : 0) - (left ? 1 : 0);
    this.playerX = clamp(this.playerX + move * 420 * dt, 54, this.worldWidth - 54);
    if (input.isKeyDown("Space") && this.shotCooldown === 0) {
      this.firePlayerShot();
    }
  }

  private firePlayerShot(): void {
    if (this.playerShots.length >= maxPlayerShots || this.playerExplosion > 0 || this.gameOver) {
      return;
    }
    this.shotCount += 1;
    this.shotCooldown = 0.18;
    this.playerShots.push({
      x: this.playerX - 3,
      y: playerY - 22,
      width: 6,
      height: 22,
      speed: -680,
      kind: "player",
      wiggle: 0
    });
    this.spawnParticles(this.playerX, playerY - 18, "#7dd3fc", 5);
  }

  private updatePlayerShot(dt: number): void {
    const remainingShots: Shot[] = [];
    for (const shot of this.playerShots) {
      shot.y += shot.speed * dt;
      if (shot.y + shot.height < 54) {
        continue;
      }

      let consumed = false;
      if (this.ufo.active && intersects(shot, { x: this.ufo.x - 38, y: this.ufo.y - 14, width: 76, height: 28 })) {
        const value = this.ufoScore();
        this.addScore(value);
        this.spawnParticles(this.ufo.x, this.ufo.y, "#fb7185", 24);
        this.ufo.active = false;
        this.message = `${value}`;
        this.waveFlash = 0.45;
        consumed = true;
      }

      if (!consumed) {
        for (const alien of this.aliens) {
          if (!alien.alive) {
            continue;
          }
          if (intersects(shot, this.alienRect(alien))) {
            alien.alive = false;
            alien.flash = 0.2;
            this.addScore(alien.points);
            this.spawnParticles(alien.x, alien.y, this.alienColor(alien.kind), 15);
            this.hitPause = 0.16;
            consumed = true;
            break;
          }
        }
      }

      if (!consumed && this.damageShieldWithShot(shot, 2)) {
        consumed = true;
      }

      if (!consumed) {
        remainingShots.push(shot);
      }
    }
    this.playerShots = remainingShots;
  }

  private updateEnemyShots(dt: number): void {
    for (const shot of this.enemyShots) {
      shot.y += shot.speed * dt;
      if (shot.kind === "squiggly") {
        shot.wiggle += dt * 18;
        shot.x += Math.sin(shot.wiggle) * 42 * dt;
      }
      if (shot.kind === "rolling") {
        shot.wiggle += dt * 10;
        shot.x += Math.sin(shot.wiggle) * 16 * dt;
      }
    }

    this.enemyShots = this.enemyShots.filter((shot) => {
      if (shot.y > height + 20) {
        return false;
      }
      if (this.damageShieldWithShot(shot, 2)) {
        return false;
      }
      const playerShotIndex = this.playerShots.findIndex((playerShot) => intersects(shot, playerShot));
      if (playerShotIndex !== -1) {
        this.spawnParticles(shot.x, shot.y, "#f8fafc", 8);
        this.playerShots.splice(playerShotIndex, 1);
        return false;
      }
      if (this.playerExplosion === 0 && this.playerHitBy(shot)) {
        this.loseLife();
        return false;
      }
      return true;
    });
  }

  private updateAliens(dt: number): void {
    for (const alien of this.aliens) {
      alien.flash = Math.max(0, alien.flash - dt);
    }
    if (!this.running || this.hitPause > 0) {
      return;
    }

    this.alienMoveTimer += dt;
    const alive = this.aliveAliens();
    const aliveRatio = Math.max(0.02, alive.length / 55);
    const levelBoost = 1 + Math.min(0.75, (this.level - 1) * 0.07);
    const singleAlienBoost = alive.length === 1 && this.alienDirection > 0 ? 1.5 : 1;
    const interval = Math.max(0.022, 0.5 * Math.pow(aliveRatio, 1.42) / levelBoost / singleAlienBoost);

    while (this.alienMoveTimer >= interval) {
      this.alienMoveTimer -= interval;
      const bounds = this.alienBounds();
      const nextLeft = bounds.left + this.alienDirection * alienStep;
      const nextRight = bounds.right + this.alienDirection * alienStep;
      if (nextRight >= this.worldWidth - 46 || nextLeft <= 46) {
        this.alienDirection *= -1;
        for (const alien of alive) {
          alien.y += alienDrop;
        }
        this.erodeShieldsFromAliens();
      } else {
        for (const alien of alive) {
          alien.x += this.alienDirection * alienStep;
        }
      }
      this.alienFrame = 1 - this.alienFrame;
    }
  }

  private updateEnemyFire(dt: number): void {
    if (!this.running || this.playerExplosion > 0) {
      return;
    }

    this.enemyFireTimer -= dt;
    this.rollingTimer -= dt;
    const fireCadence = Math.max(0.52, 1.45 - this.level * 0.07 - (55 - this.aliveAliens().length) * 0.012);

    if (this.enemyFireTimer <= 0 && this.enemyShots.length < 5) {
      const type: ShotKind = this.enemyShots.length % 2 === 0 ? "plunger" : "squiggly";
      this.fireSequenceShot(type);
      this.enemyFireTimer = fireCadence;
    }

    if (this.rollingTimer <= 0 && this.enemyShots.length < 5) {
      this.fireRollingShot();
      this.rollingTimer = Math.max(0.86, fireCadence * 1.38);
    }
  }

  private fireSequenceShot(kind: ShotKind): void {
    const sequence = kind === "plunger" ? plungerColumns : squigglyColumns;
    const index = kind === "plunger" ? this.plungerIndex : this.squigglyIndex;
    const targetCol = sequence[index % sequence.length] - 1;
    if (kind === "plunger") {
      this.plungerIndex += 1;
    } else {
      this.squigglyIndex += 1;
    }
    const alien = this.bottomAlienInColumn(targetCol) ?? this.nextAvailableColumnAlien(targetCol);
    if (alien) {
      this.enemyShots.push(this.createEnemyShot(alien, kind));
    }
  }

  private fireRollingShot(): void {
    const playerCol = clamp(Math.round((this.playerX - this.gridStartX()) / (alienWidth + alienGapX)), 0, 10);
    const alien = this.bottomAlienInColumn(playerCol) ?? this.nextAvailableColumnAlien(playerCol);
    if (alien) {
      this.enemyShots.push(this.createEnemyShot(alien, "rolling"));
    }
  }

  private createEnemyShot(alien: Alien, kind: ShotKind): Shot {
    return {
      x: alien.x - 4,
      y: alien.y + alienHeight / 2,
      width: kind === "plunger" ? 8 : 7,
      height: kind === "rolling" ? 24 : 28,
      speed: kind === "rolling" ? 250 : kind === "plunger" ? 295 : 315,
      kind,
      wiggle: alien.col
    };
  }

  private updateUfo(dt: number): void {
    if (this.ufo.active) {
      this.ufo.x += this.ufo.direction * 178 * dt;
      if (this.ufo.x < -90 || this.ufo.x > this.worldWidth + 90) {
        this.ufo.active = false;
        this.ufoTimer = this.nextUfoDelay();
      }
      return;
    }

    this.ufoTimer -= dt;
    if (this.ufoTimer <= 0) {
      this.ufo.direction = this.level % 2 === 0 ? -1 : 1;
      this.ufo.x = this.ufo.direction > 0 ? -72 : this.worldWidth + 72;
      this.ufo.y = 104;
      this.ufo.active = true;
    }
  }

  private nextUfoDelay(): number {
    return Math.max(8, 18 - Math.min(8, this.level) + (this.level % 3) * 1.5);
  }

  private ufoScore(): number {
    const mod = this.shotCount % 15;
    if (mod === 0 || mod === 14) {
      return 300;
    }
    return ufoScores[mod % ufoScores.length];
  }

  private loseLife(): void {
    if (this.playerExplosion > 0 || this.gameOver) {
      return;
    }
    this.lives -= 1;
    this.playerExplosion = 1.2;
    this.spawnParticles(this.playerX, playerY, "#f97316", 34);
    this.enemyShots = [];
    this.playerShots = [];
    if (this.lives <= 0) {
      this.message = "GAME OVER";
    }
  }

  private finishRespawn(): void {
    if (this.lives <= 0) {
      this.endGame();
      return;
    }
    this.playerX = this.worldWidth / 2;
    this.message = "SPACE TO START";
    this.running = false;
  }

  private endGame(): void {
    this.gameOver = true;
    this.running = false;
    this.message = "GAME OVER";
    this.highScore = Math.max(this.highScore, this.score);
    localStorage.setItem("gamecore-space-invaders-high-score", String(this.highScore));
  }

  private restart(): void {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.shotCount = 0;
    this.extraLifeAwarded = false;
    this.gameOver = false;
    this.playerExplosion = 0;
    this.playerX = this.worldWidth / 2;
    this.resetWave(true);
    this.message = "";
    this.running = true;
  }

  private resetWave(resetPlayer: boolean): void {
    this.aliens = [];
    this.enemyShots = [];
    this.playerShots = [];
    this.shotCooldown = 0;
    this.alienDirection = 1;
    this.alienMoveTimer = 0;
    this.enemyFireTimer = 1.2;
    this.rollingTimer = 2.3;
    this.ufo.active = false;
    this.ufoTimer = this.nextUfoDelay();
    if (resetPlayer) {
      this.playerX = this.worldWidth / 2;
    }
    const startX = this.gridStartX();
    const startY = 162 + ((this.level - 1) % 9) * 18;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 11; col += 1) {
        const kind = this.kindForRow(row);
        this.aliens.push({
          col,
          row,
          x: startX + col * (alienWidth + alienGapX),
          y: startY + row * (alienHeight + alienGapY),
          kind,
          points: kind === "squid" ? 30 : kind === "crab" ? 20 : 10,
          alive: true,
          flash: 0
        });
      }
    }
    this.shields = this.createShields();
  }

  private addScore(points: number): void {
    this.score += points;
    if (!this.extraLifeAwarded && this.score >= 1500) {
      this.lives += 1;
      this.extraLifeAwarded = true;
      this.message = "EXTRA LIFE";
      this.waveFlash = 0.8;
    }
    this.highScore = Math.max(this.highScore, this.score);
  }

  private createShields(): Shield[] {
    return [0, 1, 2, 3].map((index) => {
      const columns = 18;
      const rows = 12;
      const cell = 6;
      const cells = Array.from({ length: rows }, (_, y) =>
        Array.from({ length: columns }, (_, x) => {
          const roof = y < 3 && x > 1 && x < columns - 2;
          const sides = y >= 3 && x > 0 && x < columns - 1;
          const arch = y > 6 && x > 5 && x < 12;
          const shoulders = y > 8 && (x < 4 || x > 13);
          return (roof || sides || shoulders) && !arch;
        })
      );
      const spacing = this.worldWidth / 5;
      return {
        x: spacing * (index + 1) - (columns * cell) / 2,
        y: 774,
        columns,
        rows,
        cell,
        cells
      };
    });
  }

  private damageShieldWithShot(shot: Shot, radius: number): boolean {
    const px = shot.x + shot.width / 2;
    const py = shot.kind === "player" ? shot.y : shot.y + shot.height;
    for (const shield of this.shields) {
      if (px < shield.x || px > shield.x + shield.columns * shield.cell || py < shield.y || py > shield.y + shield.rows * shield.cell) {
        continue;
      }
      const col = Math.floor((px - shield.x) / shield.cell);
      const row = Math.floor((py - shield.y) / shield.cell);
      if (!shield.cells[row]?.[col]) {
        continue;
      }
      this.eraseShield(shield, col, row, radius);
      this.spawnParticles(px, py, "#34d399", 5);
      return true;
    }
    return false;
  }

  private erodeShieldsFromAliens(): void {
    for (const alien of this.aliveAliens()) {
      const rect = this.alienRect(alien);
      for (const shield of this.shields) {
        const shieldRect = {
          x: shield.x,
          y: shield.y,
          width: shield.columns * shield.cell,
          height: shield.rows * shield.cell
        };
        if (!intersects(rect, shieldRect)) {
          continue;
        }
        const col = clamp(Math.floor((alien.x - shield.x) / shield.cell), 0, shield.columns - 1);
        const row = clamp(Math.floor((alien.y - shield.y) / shield.cell), 0, shield.rows - 1);
        this.eraseShield(shield, col, row, 3);
      }
    }
  }

  private eraseShield(shield: Shield, centerCol: number, centerRow: number, radius: number): void {
    for (let y = centerRow - radius; y <= centerRow + radius; y += 1) {
      for (let x = centerCol - radius; x <= centerCol + radius; x += 1) {
        if (shield.cells[y]?.[x] && Math.hypot(x - centerCol, y - centerRow) <= radius + 0.35) {
          shield.cells[y][x] = false;
        }
      }
    }
  }

  private playerHitBy(shot: Shot): boolean {
    return intersects(shot, {
      x: this.playerX - playerWidth / 2,
      y: playerY - playerHeight,
      width: playerWidth,
      height: playerHeight + 10
    });
  }

  private checkInvasion(): void {
    if (this.gameOver) {
      return;
    }
    if (this.aliveAliens().some((alien) => alien.y + alienHeight / 2 >= groundY - 54)) {
      this.message = "INVASION";
      this.spawnParticles(this.playerX, playerY, "#fb7185", 30);
      this.endGame();
    }
  }

  private bottomAlienInColumn(col: number): Alien | null {
    return this.aliveAliens()
      .filter((alien) => alien.col === col)
      .sort((a, b) => b.row - a.row)[0] ?? null;
  }

  private nextAvailableColumnAlien(startCol: number): Alien | null {
    for (let offset = 1; offset < 11; offset += 1) {
      const right = this.bottomAlienInColumn((startCol + offset) % 11);
      if (right) {
        return right;
      }
      const left = this.bottomAlienInColumn((startCol - offset + 11) % 11);
      if (left) {
        return left;
      }
    }
    return null;
  }

  private aliveAliens(): Alien[] {
    return this.aliens.filter((alien) => alien.alive);
  }

  private alienBounds(): { left: number; right: number; top: number; bottom: number } {
    const alive = this.aliveAliens();
    return {
      left: Math.min(...alive.map((alien) => alien.x - alienWidth / 2)),
      right: Math.max(...alive.map((alien) => alien.x + alienWidth / 2)),
      top: Math.min(...alive.map((alien) => alien.y - alienHeight / 2)),
      bottom: Math.max(...alive.map((alien) => alien.y + alienHeight / 2))
    };
  }

  private alienRect(alien: Alien): { x: number; y: number; width: number; height: number } {
    return {
      x: alien.x - alienWidth / 2,
      y: alien.y - alienHeight / 2,
      width: alienWidth,
      height: alienHeight
    };
  }

  private gridStartX(): number {
    return (this.worldWidth - (11 * alienWidth + 10 * alienGapX)) / 2 + alienWidth / 2;
  }

  private syncViewport(): void {
    this.viewportScale = Math.min(this.game.canvas.width / baseWidth, this.game.canvas.height / height);
    this.worldWidth = this.game.canvas.width / this.viewportScale;
    this.playerX = clamp(this.playerX, 54, this.worldWidth - 54);
  }

  private kindForRow(row: number): AlienKind {
    if (row === 0) {
      return "squid";
    }
    if (row <= 2) {
      return "crab";
    }
    return "octopus";
  }

  private updateStars(dt: number): void {
    for (const star of this.stars) {
      star.y += star.speed * dt;
      if (star.y > height) {
        star.y = 0;
      }
    }
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 46 + (i % 5) * 22;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.38 + (i % 4) * 0.08,
        color
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 140 * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#111827");
    gradient.addColorStop(0.5, "#07111f");
    gradient.addColorStop(1, "#02030a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.worldWidth, height);

    ctx.save();
    ctx.globalAlpha = 0.7;
    for (const star of this.stars) {
      ctx.fillStyle = star.size > 2 ? "#a7f3d0" : "#e0f2fe";
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(45, 212, 191, 0.07)";
    ctx.lineWidth = 1;
    for (let x = 42; x < this.worldWidth; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 84);
      ctx.lineTo(x, groundY + 24);
      ctx.stroke();
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(2, 6, 23, 0.78)";
    ctx.fillRect(0, 0, this.worldWidth, 74);
    ctx.strokeStyle = "rgba(94, 234, 212, 0.42)";
    ctx.beginPath();
    ctx.moveTo(24, 74);
    ctx.lineTo(this.worldWidth - 24, 74);
    ctx.stroke();

    ctx.font = "700 24px ui-sans-serif, system-ui";
    ctx.fillStyle = "#e0f2fe";
    ctx.fillText(`SCORE ${this.score.toString().padStart(5, "0")}`, 32, 44);
    ctx.textAlign = "center";
    ctx.fillText(`HIGH ${this.highScore.toString().padStart(5, "0")}`, this.worldWidth / 2, 44);
    ctx.textAlign = "right";
    ctx.fillText(`WAVE ${this.level}`, this.worldWidth - 32, 44);
    ctx.textAlign = "left";
  }

  private drawAliens(ctx: CanvasRenderingContext2D): void {
    for (const alien of this.aliens) {
      if (!alien.alive && alien.flash <= 0) {
        continue;
      }
      ctx.save();
      ctx.translate(alien.x, alien.y);
      ctx.globalAlpha = alien.alive ? 1 : alien.flash / 0.2;
      this.drawAlien(ctx, alien.kind);
      ctx.restore();
    }
  }

  private drawAlien(ctx: CanvasRenderingContext2D, kind: AlienKind): void {
    const color = this.alienColor(kind);
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    const sprite = this.alienSprites[kind];
    if (sprite) {
      const bob = this.alienFrame === 0 ? -1.5 : 1.5;
      ctx.drawImage(sprite, -34, -28 + bob, 68, 54);
    }
  }

  private alienColor(kind: AlienKind): string {
    if (kind === "squid") {
      return "#f472b6";
    }
    if (kind === "crab") {
      return "#38bdf8";
    }
    return "#34d399";
  }

  private drawUfo(ctx: CanvasRenderingContext2D): void {
    if (!this.ufo.active) {
      return;
    }
    ctx.save();
    ctx.translate(this.ufo.x, this.ufo.y);
    ctx.fillStyle = "#fb7185";
    ctx.shadowColor = "#fb7185";
    ctx.shadowBlur = 18;
    roundRect(ctx, -38, -8, 76, 18, 9);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -8, 28, 12, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#fee2e2";
    for (const x of [-22, 0, 22]) {
      ctx.fillRect(x - 3, 2, 6, 6);
    }
    ctx.restore();
  }

  private drawShields(ctx: CanvasRenderingContext2D): void {
    for (const shield of this.shields) {
      ctx.save();
      ctx.shadowColor = "#34d399";
      ctx.shadowBlur = 8;
      for (let y = 0; y < shield.rows; y += 1) {
        for (let x = 0; x < shield.columns; x += 1) {
          if (!shield.cells[y][x]) {
            continue;
          }
          const alpha = 0.74 + ((x + y) % 3) * 0.08;
          ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
          ctx.fillRect(shield.x + x * shield.cell, shield.y + y * shield.cell, shield.cell - 1, shield.cell - 1);
        }
      }
      ctx.restore();
    }
  }

  private drawShots(ctx: CanvasRenderingContext2D): void {
    for (const shot of this.playerShots) {
      ctx.fillStyle = "#e0f2fe";
      ctx.shadowColor = "#7dd3fc";
      ctx.shadowBlur = 14;
      roundRect(ctx, shot.x, shot.y, shot.width, shot.height, 3);
      ctx.fill();
    }

    for (const shot of this.enemyShots) {
      ctx.save();
      ctx.translate(shot.x + shot.width / 2, shot.y + shot.height / 2);
      ctx.strokeStyle = shot.kind === "rolling" ? "#facc15" : shot.kind === "plunger" ? "#fb7185" : "#c084fc";
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (shot.kind === "plunger") {
        ctx.moveTo(0, -14);
        ctx.lineTo(0, 14);
        ctx.moveTo(-5, -7);
        ctx.lineTo(5, -7);
        ctx.moveTo(-5, 7);
        ctx.lineTo(5, 7);
      } else if (shot.kind === "rolling") {
        ctx.arc(0, 0, 10, shot.wiggle, shot.wiggle + Math.PI * 1.45);
      } else {
        ctx.moveTo(0, -14);
        ctx.quadraticCurveTo(10, -5, 0, 4);
        ctx.quadraticCurveTo(-10, 12, 0, 18);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    if (this.playerExplosion > 0) {
      return;
    }
    ctx.save();
    ctx.translate(this.playerX, playerY);
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 18;
    if (this.playerSprite) {
      ctx.drawImage(this.playerSprite, -52, -54, 104, 62);
    }
    ctx.fillStyle = "rgba(125, 211, 252, 0.35)";
    ctx.fillRect(-playerWidth / 2 - 8, 2, playerWidth + 16, 4);
    ctx.restore();
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "#22d3ee";
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(28, groundY);
    ctx.lineTo(this.worldWidth - 28, groundY);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 18px ui-sans-serif, system-ui";
    ctx.fillText(`LIVES ${Math.max(0, this.lives)}`, 32, 1016);
    for (let i = 0; i < Math.max(0, this.lives); i += 1) {
      ctx.fillStyle = "#7dd3fc";
      roundRect(ctx, 132 + i * 34, 996, 24, 12, 4);
      ctx.fill();
      ctx.fillRect(140 + i * 34, 986, 8, 10);
    }
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText(`SHOTS ${this.shotCount.toString().padStart(3, "0")}`, this.worldWidth - 32, 1016);
    ctx.textAlign = "left";
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      ctx.globalAlpha = clamp(particle.life * 2.2, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, 4, 4);
      ctx.globalAlpha = 1;
    }
  }

  private drawMessage(ctx: CanvasRenderingContext2D): void {
    if (!this.message && this.running && this.waveFlash <= 0) {
      return;
    }
    ctx.save();
    const pulse = 0.72 + Math.sin(performance.now() / 180) * 0.18;
    ctx.globalAlpha = this.running ? this.waveFlash : pulse;
    ctx.fillStyle = "rgba(2, 6, 23, 0.48)";
    ctx.fillRect(0, 452, this.worldWidth, 116);
    ctx.textAlign = "center";
    ctx.fillStyle = this.gameOver ? "#fb7185" : "#e0f2fe";
    ctx.shadowColor = this.gameOver ? "#fb7185" : "#22d3ee";
    ctx.shadowBlur = 18;
    ctx.font = "800 42px ui-sans-serif, system-ui";
    ctx.fillText(this.message || "WAVE CLEAR", this.worldWidth / 2, 520);
    if (!this.running && !this.gameOver) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 18px ui-sans-serif, system-ui";
      ctx.fillText("SPACE TO START", this.worldWidth / 2, 552);
    } else if (this.gameOver) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fecdd3";
      ctx.font = "700 18px ui-sans-serif, system-ui";
      ctx.fillText("SPACE TO RESTART", this.worldWidth / 2, 552);
    }
    ctx.restore();
  }
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  if (!canvas) {
    throw new Error("Missing #game canvas");
  }

  const resizeCanvas = (): void => {
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));
  };
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const game = createGame({
    canvas,
    width: canvas.width,
    height: canvas.height,
    background: "#050711",
    pixelArt: false
  });

  await game.setScene(new SpaceInvadersScene());
  game.start();
}

void main();
