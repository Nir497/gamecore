import "./styles.css";
import * as THREE from "three";
import { ThreeScene } from "../../../src/engine";

type CellValue = 0 | 1 | 2;
type RoundState = "idle" | "running" | "resolving";
type DirectionName = "up" | "down" | "left" | "right";
type GameMode = "bot" | "multiplayer";

interface Direction {
  name: DirectionName;
  x: number;
  y: number;
  angle: number;
}

interface Cycle {
  id: 1 | 2;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  dir: Direction;
  pendingDir: Direction;
  alive: boolean;
  mesh: THREE.Group;
  body: THREE.Mesh;
  light: THREE.PointLight;
  headColor: THREE.Color;
  scoreElement: HTMLElement;
}

const columns = 60;
const rows = 48;
const tickMs = 80;
const cellSize = 0.28;
const arenaWidth = columns * cellSize;
const arenaDepth = rows * cellSize;
const trailHeight = 0.18;
const cycleHeight = 0.34;
const crashDuration = 0.82;
const hardBotErrorRate = 0.05;
const cameraPosition = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();

const directions: Record<DirectionName, Direction> = {
  up: { name: "up", x: 0, y: -1, angle: Math.PI },
  down: { name: "down", x: 0, y: 1, angle: 0 },
  left: { name: "left", x: -1, y: 0, angle: -Math.PI / 2 },
  right: { name: "right", x: 1, y: 0, angle: Math.PI / 2 }
};
const leftTurns: Record<DirectionName, DirectionName> = {
  up: "left",
  left: "down",
  down: "right",
  right: "up"
};
const rightTurns: Record<DirectionName, DirectionName> = {
  up: "right",
  right: "down",
  down: "left",
  left: "up"
};

const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
const statusNode = document.querySelector<HTMLElement>("#status");
const scoreOneNode = document.querySelector<HTMLElement>("#score-one");
const scoreTwoNode = document.querySelector<HTMLElement>("#score-two");

if (!canvasElement || !statusNode || !scoreOneNode || !scoreTwoNode) {
  throw new Error("Missing Tron page elements.");
}

const canvas = canvasElement;
const statusElement = statusNode;
const scoreOneElement = scoreOneNode;
const scoreTwoElement = scoreTwoNode;

const world = new ThreeScene({ canvas, background: "#03050a", fov: 64, near: 0.1, far: 120 });
world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
world.renderer.shadowMap.enabled = true;
world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
world.camera.position.set(-arenaWidth * 0.34, 2.05, 0);
world.camera.lookAt(0, 0.45, 0);

const grid: CellValue[] = new Array(columns * rows).fill(0);
let roundState: RoundState = "idle";
let accumulator = 0;
let moveProgress = 1;
let resolveTimer = 0;
let scoreOne = 0;
let scoreTwo = 0;
let pulseTime = 0;
let selectedMode: GameMode = "bot";

const trailGeometry = new THREE.BoxGeometry(cellSize * 0.84, trailHeight, cellSize * 0.84);
const trailOneMaterial = new THREE.MeshStandardMaterial({
  color: "#006688",
  emissive: "#00b9c8",
  emissiveIntensity: 1.45,
  roughness: 0.38,
  metalness: 0.16
});
const trailTwoMaterial = new THREE.MeshStandardMaterial({
  color: "#884400",
  emissive: "#ff7a00",
  emissiveIntensity: 1.35,
  roughness: 0.38,
  metalness: 0.16
});
const trailOne = new THREE.InstancedMesh(trailGeometry, trailOneMaterial, columns * rows);
const trailTwo = new THREE.InstancedMesh(trailGeometry, trailTwoMaterial, columns * rows);
trailOne.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
trailTwo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
trailOne.castShadow = true;
trailTwo.castShadow = true;
trailOne.receiveShadow = true;
trailTwo.receiveShadow = true;
world.scene.add(trailOne, trailTwo);

let trailOneCount = 0;
let trailTwoCount = 0;

const playerOne = createCycle(1, "#00ffff", scoreOneElement);
const playerTwo = createCycle(2, "#ff9900", scoreTwoElement);

setupScene();
resetRound("Press 1 for bot or 2 for multiplayer");
resize();
window.addEventListener("resize", resize);
window.addEventListener("keydown", onKeyDown, { passive: false });

let last = performance.now();
requestAnimationFrame(loop);

function setupScene(): void {
  world.scene.fog = new THREE.FogExp2("#03050a", 0.038);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(arenaWidth + 0.16, 0.08, arenaDepth + 0.16),
    new THREE.MeshStandardMaterial({
      color: "#061018",
      emissive: "#062436",
      emissiveIntensity: 0.58,
      roughness: 0.7,
      metalness: 0.18
    })
  );
  floor.position.y = -0.06;
  floor.receiveShadow = true;
  world.scene.add(floor);

  const gridHelper = new THREE.GridHelper(arenaWidth, columns, "#1be7ff", "#0b2b38");
  gridHelper.position.y = 0.012;
  gridHelper.scale.z = rows / columns;
  world.scene.add(gridHelper);

  const borderMaterial = new THREE.MeshStandardMaterial({
    color: "#092231",
    emissive: "#00d9ff",
    emissiveIntensity: 1.2,
    roughness: 0.42,
    metalness: 0.32
  });
  const horizontalBorder = new THREE.BoxGeometry(arenaWidth + cellSize, 0.42, 0.12);
  const verticalBorder = new THREE.BoxGeometry(0.12, 0.42, arenaDepth + cellSize);
  const borderPositions: Array<[THREE.BoxGeometry, number, number]> = [
    [horizontalBorder, 0, -arenaDepth / 2 - cellSize / 2],
    [horizontalBorder, 0, arenaDepth / 2 + cellSize / 2],
    [verticalBorder, -arenaWidth / 2 - cellSize / 2, 0],
    [verticalBorder, arenaWidth / 2 + cellSize / 2, 0]
  ];

  for (const [geometry, x, z] of borderPositions) {
    const wall = new THREE.Mesh(geometry, borderMaterial);
    wall.position.set(x, 0.19, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    world.scene.add(wall);
  }

  const keyLight = new THREE.DirectionalLight("#d8fbff", 2.4);
  keyLight.position.set(-4.5, 9, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  world.scene.add(keyLight);
  world.scene.add(new THREE.HemisphereLight("#7beeff", "#090610", 1.25));

  const underglowOne = new THREE.PointLight("#00ffff", 2.3, 16, 2);
  underglowOne.position.set(-arenaWidth * 0.34, 1.2, 0);
  const underglowTwo = new THREE.PointLight("#ff9900", 2.1, 16, 2);
  underglowTwo.position.set(arenaWidth * 0.34, 1.2, 0);
  world.scene.add(underglowOne, underglowTwo);
}

function createCycle(id: 1 | 2, color: string, scoreElement: HTMLElement): Cycle {
  const group = new THREE.Group();
  const headColor = new THREE.Color(color);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.1,
    roughness: 0.24,
    metalness: 0.28
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.82, cycleHeight, cellSize * 1.18), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = cycleHeight / 2;

  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(cellSize * 0.32, cycleHeight * 0.72, cellSize * 0.38),
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#ffffff",
      emissiveIntensity: 1.7,
      roughness: 0.2,
      metalness: 0.06
    })
  );
  cockpit.position.set(0, cycleHeight * 0.84, cellSize * 0.12);

  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: "#101319",
    emissive: color,
    emissiveIntensity: 0.8,
    roughness: 0.46,
    metalness: 0.34
  });
  const wheelGeometry = new THREE.TorusGeometry(cellSize * 0.2, cellSize * 0.045, 8, 22);
  const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
  const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
  frontWheel.rotation.y = Math.PI / 2;
  rearWheel.rotation.y = Math.PI / 2;
  frontWheel.position.set(0, cycleHeight * 0.24, cellSize * 0.42);
  rearWheel.position.set(0, cycleHeight * 0.24, -cellSize * 0.42);

  const light = new THREE.PointLight(color, 2.6, 4.8, 2);
  light.position.y = 0.72;

  group.add(body, cockpit, frontWheel, rearWheel, light);
  world.scene.add(group);

  return {
    id,
    x: 0,
    y: 0,
    fromX: 0,
    fromY: 0,
    dir: directions.right,
    pendingDir: directions.right,
    alive: true,
    mesh: group,
    body,
    light,
    headColor,
    scoreElement
  };
}

function resetRound(message: string): void {
  grid.fill(0);
  trailOneCount = 0;
  trailTwoCount = 0;
  trailOne.count = 0;
  trailTwo.count = 0;

  resetCycle(playerOne, 15, 24, directions.right);
  resetCycle(playerTwo, 45, 24, directions.left);
  occupy(playerOne);
  occupy(playerTwo);

  roundState = "idle";
  accumulator = 0;
  moveProgress = 1;
  resolveTimer = 0;
  statusElement.textContent = message;
  updateScores();
  renderCycles(1);
}

function resetCycle(cycle: Cycle, x: number, y: number, dir: Direction): void {
  cycle.x = x;
  cycle.y = y;
  cycle.fromX = x;
  cycle.fromY = y;
  cycle.dir = dir;
  cycle.pendingDir = dir;
  cycle.alive = true;
  cycle.mesh.visible = true;
  cycle.body.visible = true;
  cycle.light.intensity = 2.6;
}

function startRound(): void {
  resetRound(selectedMode === "bot" ? "Bot duel" : "Multiplayer duel");
  roundState = "running";
}

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  pulseTime += dt;

  if (roundState === "running") {
    accumulator += dt * 1000;
    moveProgress = Math.min(accumulator / tickMs, 1);
    while (accumulator >= tickMs) {
      accumulator -= tickMs;
      stepRound();
      moveProgress = 0;
    }
  } else if (roundState === "resolving") {
    resolveTimer += dt;
    flashCrashedCycles();
    if (resolveTimer >= crashDuration) {
      resetRound("Press 1 for bot or 2 for multiplayer");
    }
  }

  renderCycles(roundState === "running" ? moveProgress : 1);
  world.render();
  requestAnimationFrame(loop);
}

function stepRound(): void {
  applyPendingDirection(playerOne);
  if (selectedMode === "bot") {
    playerTwo.pendingDir = chooseBotDirection(playerTwo, playerOne);
  }
  applyPendingDirection(playerTwo);

  const nextOne = nextCell(playerOne);
  const nextTwo = nextCell(playerTwo);
  let playerOneCrash = !isCellOpen(nextOne.x, nextOne.y);
  let playerTwoCrash = !isCellOpen(nextTwo.x, nextTwo.y);

  if (nextOne.x === nextTwo.x && nextOne.y === nextTwo.y) {
    playerOneCrash = true;
    playerTwoCrash = true;
  }

  playerOne.fromX = playerOne.x;
  playerOne.fromY = playerOne.y;
  playerTwo.fromX = playerTwo.x;
  playerTwo.fromY = playerTwo.y;

  if (playerOneCrash) {
    playerOne.alive = false;
  }
  if (playerTwoCrash) {
    playerTwo.alive = false;
  }

  if (!playerOneCrash) {
    playerOne.x = nextOne.x;
    playerOne.y = nextOne.y;
    occupy(playerOne);
  }
  if (!playerTwoCrash) {
    playerTwo.x = nextTwo.x;
    playerTwo.y = nextTwo.y;
    occupy(playerTwo);
  }

  if (playerOneCrash || playerTwoCrash) {
    finishRound(playerOneCrash, playerTwoCrash);
  }
}

function finishRound(playerOneCrash: boolean, playerTwoCrash: boolean): void {
  roundState = "resolving";
  resolveTimer = 0;
  moveProgress = 1;

  if (playerOneCrash && playerTwoCrash) {
    statusElement.textContent = "Draw";
    return;
  }
  if (playerTwoCrash) {
    scoreOne += 1;
    statusElement.textContent = "Player 1 wins";
  } else {
    scoreTwo += 1;
    statusElement.textContent = "Player 2 wins";
  }
  updateScores();
}

function onKeyDown(event: KeyboardEvent): void {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Digit1", "Digit2", "Numpad1", "Numpad2"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "Digit1" || event.code === "Numpad1" || event.key === "1") {
    selectedMode = "bot";
    startRound();
    return;
  }
  if (event.code === "Digit2" || event.code === "Numpad2" || event.key === "2") {
    selectedMode = "multiplayer";
    startRound();
    return;
  }
  if (event.code === "Space") {
    startRound();
    return;
  }
  if (roundState !== "running") {
    return;
  }

  const playerOneDirection = keyToPlayerOneDirection(event);
  if (playerOneDirection) {
    playerOne.pendingDir = playerOneDirection;
    return;
  }

  const playerTwoDirection = keyToPlayerTwoDirection(event);
  if (playerTwoDirection && selectedMode === "multiplayer") {
    playerTwo.pendingDir = playerTwoDirection;
  }
}

function keyToPlayerOneDirection(event: KeyboardEvent): Direction | null {
  const key = event.key.toLowerCase();
  if (event.code === "KeyA" || key === "a" || (selectedMode === "bot" && event.code === "ArrowLeft")) {
    return turn(playerOne, "left");
  }
  if (event.code === "KeyD" || key === "d" || (selectedMode === "bot" && event.code === "ArrowRight")) {
    return turn(playerOne, "right");
  }
  if (event.code === "KeyW" || key === "w" || (selectedMode === "bot" && event.code === "ArrowUp")) {
    return playerOne.dir;
  }
  return null;
}

function keyToPlayerTwoDirection(event: KeyboardEvent): Direction | null {
  if (event.code === "ArrowLeft") {
    return turn(playerTwo, "left");
  }
  if (event.code === "ArrowRight") {
    return turn(playerTwo, "right");
  }
  if (event.code === "ArrowUp") {
    return playerTwo.dir;
  }
  return null;
}

function turn(cycle: Cycle, side: "left" | "right"): Direction {
  const nextName = side === "left" ? leftTurns[cycle.dir.name] : rightTurns[cycle.dir.name];
  return directions[nextName];
}

function applyPendingDirection(cycle: Cycle): void {
  if (!isOpposite(cycle.dir, cycle.pendingDir)) {
    cycle.dir = cycle.pendingDir;
  } else {
    cycle.pendingDir = cycle.dir;
  }
}

function isOpposite(a: Direction, b: Direction): boolean {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function nextCell(cycle: Cycle): { x: number; y: number } {
  return { x: cycle.x + cycle.dir.x, y: cycle.y + cycle.dir.y };
}

function isCellOpen(x: number, y: number): boolean {
  return x >= 0 && x < columns && y >= 0 && y < rows && grid[indexFor(x, y)] === 0;
}

function occupy(cycle: Cycle): void {
  grid[indexFor(cycle.x, cycle.y)] = cycle.id;
  const matrix = new THREE.Matrix4().makeTranslation(...cellToWorld(cycle.x, cycle.y, trailHeight / 2));
  if (cycle.id === 1) {
    trailOne.setMatrixAt(trailOneCount, matrix);
    trailOneCount += 1;
    trailOne.count = trailOneCount;
    trailOne.instanceMatrix.needsUpdate = true;
  } else {
    trailTwo.setMatrixAt(trailTwoCount, matrix);
    trailTwoCount += 1;
    trailTwo.count = trailTwoCount;
    trailTwo.instanceMatrix.needsUpdate = true;
  }
}

function renderCycles(progress: number): void {
  positionCycle(playerOne, progress);
  positionCycle(playerTwo, progress);
  updateRiderCamera(progress);

  const lightPulse = 0.82 + Math.sin(pulseTime * 9) * 0.18;
  trailOneMaterial.emissiveIntensity = 1.35 + lightPulse * 0.28;
  trailTwoMaterial.emissiveIntensity = 1.25 + lightPulse * 0.24;
}

function positionCycle(cycle: Cycle, progress: number): void {
  const x = cycle.fromX + (cycle.x - cycle.fromX) * progress;
  const y = cycle.fromY + (cycle.y - cycle.fromY) * progress;
  const [worldX, worldY, worldZ] = cellToWorld(x, y, 0);
  cycle.mesh.position.set(worldX, worldY, worldZ);
  cycle.mesh.rotation.y = cycle.dir.angle;
  cycle.mesh.position.y += Math.sin(pulseTime * 16 + cycle.id) * 0.018;
  cycle.light.color.copy(cycle.headColor);
}

function updateRiderCamera(progress: number): void {
  const x = playerOne.fromX + (playerOne.x - playerOne.fromX) * progress;
  const y = playerOne.fromY + (playerOne.y - playerOne.fromY) * progress;
  const [worldX, , worldZ] = cellToWorld(x, y, 0);
  const forward = new THREE.Vector3(playerOne.dir.x, 0, playerOne.dir.y).normalize();

  cameraPosition.set(worldX, 2.05, worldZ).addScaledVector(forward, -2.28);
  cameraTarget.set(worldX, 0.42, worldZ).addScaledVector(forward, 9.2);

  world.camera.position.lerp(cameraPosition, 0.36);
  world.camera.lookAt(cameraTarget);
}

function flashCrashedCycles(): void {
  const visible = Math.floor(resolveTimer * 18) % 2 === 0;
  if (!playerOne.alive) {
    playerOne.body.visible = visible;
    playerOne.light.intensity = visible ? 7 : 0.4;
  }
  if (!playerTwo.alive) {
    playerTwo.body.visible = visible;
    playerTwo.light.intensity = visible ? 7 : 0.4;
  }
}

function chooseBotDirection(bot: Cycle, opponent: Cycle): Direction {
  const safeDirections = candidateDirections(bot).filter((direction) => isCellOpen(bot.x + direction.x, bot.y + direction.y));
  if (safeDirections.length === 0) {
    return bot.dir;
  }
  if (Math.random() < hardBotErrorRate) {
    return randomItem(safeDirections);
  }

  let bestScore = -Infinity;
  let bestDirections: Direction[] = [];
  for (const direction of safeDirections) {
    const nextX = bot.x + direction.x;
    const nextY = bot.y + direction.y;
    const openSpace = floodFill(nextX, nextY);
    const pressure = columns + rows - Math.abs(nextX - opponent.x) - Math.abs(nextY - opponent.y);
    const score = openSpace + pressure * 0.16;

    if (score > bestScore) {
      bestScore = score;
      bestDirections = [direction];
    } else if (score === bestScore) {
      bestDirections.push(direction);
    }
  }

  return randomItem(bestDirections);
}

function candidateDirections(cycle: Cycle): Direction[] {
  return Object.values(directions).filter((direction) => !isOpposite(cycle.dir, direction));
}

function floodFill(startX: number, startY: number): number {
  const visited = new Uint8Array(columns * rows);
  const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  let head = 0;
  let count = 0;
  visited[indexFor(startX, startY)] = 1;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    count += 1;

    for (const direction of Object.values(directions)) {
      const x = current.x + direction.x;
      const y = current.y + direction.y;
      if (x < 0 || x >= columns || y < 0 || y >= rows) {
        continue;
      }
      const index = indexFor(x, y);
      if (visited[index] || grid[index] !== 0) {
        continue;
      }
      visited[index] = 1;
      queue.push({ x, y });
    }
  }

  return count;
}

function cellToWorld(x: number, y: number, height: number): [number, number, number] {
  return [(x + 0.5) * cellSize - arenaWidth / 2, height, (y + 0.5) * cellSize - arenaDepth / 2];
}

function indexFor(x: number, y: number): number {
  return y * columns + x;
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function updateScores(): void {
  playerOne.scoreElement.textContent = String(scoreOne);
  playerTwo.scoreElement.textContent = String(scoreTwo);
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.max(1, Math.floor(width * Math.min(window.devicePixelRatio, 2)));
  canvas.height = Math.max(1, Math.floor(height * Math.min(window.devicePixelRatio, 2)));
  world.resize(canvas.width, canvas.height);
  world.renderer.domElement.style.width = `${width}px`;
  world.renderer.domElement.style.height = `${height}px`;
}
