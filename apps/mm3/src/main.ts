import "./styles.css";
import * as THREE from "three";
import { InputManager, ThreeScene } from "../../../src/engine";

type Phase = "lobby" | "round" | "results";
type Role = "Innocent" | "Sheriff" | "Murderer";

interface MapOption {
  id: string;
  name: string;
  description: string;
  color: string;
}

interface PlayerRecord {
  name: string;
  role: Role;
  alive: boolean;
}

interface Bot {
  record: PlayerRecord;
  mesh: THREE.Group;
  target: THREE.Vector3;
  speed: number;
  floor: number;
  waitTime: number;
}

interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floor: number;
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`MM3 is missing ${selector}.`);
  }
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#game");
const voteGrid = requireElement<HTMLDivElement>("#vote-grid");
const votePanel = requireElement<HTMLDivElement>("#vote-panel");
const phaseLabel = requireElement<HTMLSpanElement>("#phase-label");
const timerLabel = requireElement<HTMLElement>("#timer-label");
const roleChip = requireElement<HTMLDivElement>("#role-chip");
const promptLabel = requireElement<HTMLDivElement>("#prompt");
const playerList = requireElement<HTMLDivElement>("#player-list");
const toast = requireElement<HTMLDivElement>("#toast");
const crosshair = requireElement<HTMLDivElement>("#crosshair");

const mapOptions: MapOption[] = [
  {
    id: "atrium-house",
    name: "Atrium House",
    description: "Open foyer, side rooms, upstairs balcony.",
    color: "#2f7f8f"
  },
  {
    id: "shadow-house",
    name: "Shadow House",
    description: "Cool lighting, tighter upstairs routes.",
    color: "#4f5d95"
  },
  {
    id: "ember-house",
    name: "Ember House",
    description: "Warm halls with a long central sightline.",
    color: "#9b5a3c"
  }
];

const botNames = ["Riven", "Marlow", "Juno", "Vale", "Sable", "Pax", "Nyx"];
const floorHeights = [0, 3.2];
const stairBounds = {
  minX: -3.2,
  maxX: 3.2,
  minZ: 1.6,
  maxZ: 7.2
};
const botColors: Record<Role, string> = {
  Innocent: "#63b3ed",
  Sheriff: "#f6c453",
  Murderer: "#ef6f6c"
};

const input = new InputManager(canvas);
const world = new ThreeScene({ canvas, background: "#11151d", fov: 72, far: 420 });
world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
world.renderer.shadowMap.enabled = true;
world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
world.camera.rotation.order = "YXZ";

let phase: Phase = "lobby";
let selectedMap = mapOptions[0];
let selectedMapId = selectedMap.id;
let playerRole: Role | "Pending" = "Pending";
let playerAlive = true;
let playerFloor = 0;
let yaw = 0;
let pitch = 0;
let roundTime = 150;
let resultsTime = 0;
let toastTime = 0;
let lastMurdererIndex = -1;

const players: PlayerRecord[] = [{ name: "You", role: "Innocent", alive: true }];
const bots: Bot[] = [];
const obstacles: Obstacle[] = [];
const collidableMeshes: THREE.Object3D[] = [];
const playerPosition = new THREE.Vector3(0, 0.65, 6);
const tempDirection = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const rightVector = new THREE.Vector3();
const lineCheckPoint = new THREE.Vector3();
let playerMesh: THREE.Group | undefined;

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * Math.min(window.devicePixelRatio, 2);
  canvas.height = height * Math.min(window.devicePixelRatio, 2);
  world.resize(canvas.width, canvas.height);
}

window.addEventListener("resize", resize);
resize();

canvas.addEventListener("click", () => {
  if (phase === "round" && !input.pointer.locked) {
    void input.requestPointerLock();
  }
});

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  toastTime = 2.4;
}

function clearScene(): void {
  while (world.scene.children.length > 0) {
    const object = world.scene.children[0];
    world.scene.remove(object);
  }
  obstacles.length = 0;
  collidableMeshes.length = 0;
  playerMesh = undefined;
}

function material(color: THREE.ColorRepresentation, roughness = 0.72): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 });
}

function addBox(
  size: THREE.Vector3,
  position: THREE.Vector3,
  color: THREE.ColorRepresentation,
  castShadow = true,
  receiveShadow = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material(color));
  mesh.position.copy(position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  world.scene.add(mesh);
  return mesh;
}

function addObstacle(size: THREE.Vector3, position: THREE.Vector3, color: THREE.ColorRepresentation, floor: number): void {
  const mesh = addBox(size, position, color);
  collidableMeshes.push(mesh);
  obstacles.push({
    minX: position.x - size.x / 2,
    maxX: position.x + size.x / 2,
    minZ: position.z - size.z / 2,
    maxZ: position.z + size.z / 2,
    floor
  });
}

function addFloorWithStairOpening(y: number): void {
  addBox(new THREE.Vector3(22, 0.22, 10.2), new THREE.Vector3(0, y, -4), "#323b4a", false);
  addBox(new THREE.Vector3(7.4, 0.22, 7.6), new THREE.Vector3(-7.3, y, 4.8), "#323b4a", false);
  addBox(new THREE.Vector3(7.4, 0.22, 7.6), new THREE.Vector3(7.3, y, 4.8), "#323b4a", false);
  addBox(new THREE.Vector3(7.2, 0.22, 1.9), new THREE.Vector3(0, y, 7.45), "#323b4a", false);
  addBox(new THREE.Vector3(22, 0.22, 0.4), new THREE.Vector3(0, y, 8.8), "#323b4a", false);

  const railY = y + 0.52;
  addBox(new THREE.Vector3(0.18, 1, 5.2), new THREE.Vector3(-3.55, railY, 3.8), "#8b95a6");
  addBox(new THREE.Vector3(0.18, 1, 2.7), new THREE.Vector3(3.55, railY, 2.55), "#8b95a6");
  addBox(new THREE.Vector3(7.2, 1, 0.18), new THREE.Vector3(0, railY, 1.12), "#8b95a6");
  addBox(new THREE.Vector3(0.22, 2.2, 0.18), new THREE.Vector3(3.55, y + 1.1, 6.45), "#aeb7c5");
  addBox(new THREE.Vector3(0.22, 2.2, 0.18), new THREE.Vector3(3.55, y + 1.1, 8.35), "#aeb7c5");
  addBox(new THREE.Vector3(0.24, 0.18, 2.1), new THREE.Vector3(3.55, y + 2.12, 7.4), "#aeb7c5");
}

function createCharacter(color: THREE.ColorRepresentation, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 10), material(color));
  body.position.y = 0.66;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), material("#e8d2bd", 0.64));
  head.position.y = 1.38;
  head.castShadow = true;
  group.add(head);

  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.16), material("#f8fafc", 0.5));
  marker.position.set(0, 1.08, -0.31);
  marker.castShadow = true;
  group.add(marker);

  return group;
}

function addLights(baseColor: THREE.ColorRepresentation): void {
  world.scene.add(new THREE.HemisphereLight("#dbeafe", "#16110d", 1.4));

  const sun = new THREE.DirectionalLight("#fff5df", 2.8);
  sun.position.set(-8, 14, 8);
  sun.castShadow = true;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  world.scene.add(sun);

  const accent = new THREE.PointLight(baseColor, 20, 26);
  accent.position.set(0, 5.4, -2);
  world.scene.add(accent);
}

function buildLobby(): void {
  clearScene();
  addLights("#70d6ff");
  world.scene.fog = new THREE.Fog("#11151d", 18, 70);

  addBox(new THREE.Vector3(34, 0.2, 34), new THREE.Vector3(0, -0.1, 0), "#1f2937", false);
  addBox(new THREE.Vector3(12, 0.18, 12), new THREE.Vector3(0, 0.02, -4), "#233447", false);
  addBox(new THREE.Vector3(5, 2.8, 0.35), new THREE.Vector3(0, 1.4, -11), selectedMap.color);
  addBox(new THREE.Vector3(1.2, 1.2, 1.2), new THREE.Vector3(-7, 0.6, -3), "#f6c453");
  addBox(new THREE.Vector3(1.2, 1.2, 1.2), new THREE.Vector3(7, 0.6, -3), "#ef6f6c");

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 13;
    addBox(new THREE.Vector3(0.34, 2.2, 0.34), new THREE.Vector3(Math.cos(angle) * radius, 1.1, Math.sin(angle) * radius), "#344256");
  }

  world.camera.position.set(0, 1.7, 9.5);
  yaw = 0;
  pitch = -0.05;
}

function spawnPlayerCharacter(): void {
  if (playerRole === "Pending") {
    return;
  }

  playerMesh = createCharacter(botColors[playerRole], "You");
  playerMesh.position.copy(playerPosition);
  playerMesh.rotation.y = yaw;
  world.scene.add(playerMesh);
}

function buildHouse(): void {
  clearScene();
  addLights(selectedMap.color);
  world.scene.fog = new THREE.Fog("#12151c", 26, 95);

  addBox(new THREE.Vector3(52, 0.25, 44), new THREE.Vector3(0, -0.14, 0), "#17202b", false);

  for (const floor of [0, 1]) {
    const y = floorHeights[floor];
    if (floor === 0) {
      addBox(new THREE.Vector3(22, 0.22, 18), new THREE.Vector3(0, y, 0), "#293241", false);
    } else {
      addFloorWithStairOpening(y);
    }
    addObstacle(new THREE.Vector3(22, 2.8, 0.34), new THREE.Vector3(0, y + 1.45, -9), "#3c4656", floor);
    addObstacle(new THREE.Vector3(22, 2.8, 0.34), new THREE.Vector3(0, y + 1.45, 9), "#3c4656", floor);
    addObstacle(new THREE.Vector3(0.34, 2.8, 18), new THREE.Vector3(-11, y + 1.45, 0), "#3c4656", floor);
    addObstacle(new THREE.Vector3(0.34, 2.8, 18), new THREE.Vector3(11, y + 1.45, 0), "#3c4656", floor);

    addObstacle(new THREE.Vector3(0.28, 2.45, 5.9), new THREE.Vector3(-3.2, y + 1.35, -5.95), "#465265", floor);
    if (floor === 0) {
      addObstacle(new THREE.Vector3(0.28, 2.45, 5.9), new THREE.Vector3(3.2, y + 1.35, 5.95), "#465265", floor);
    } else {
      addObstacle(new THREE.Vector3(0.28, 2.45, 2.2), new THREE.Vector3(3.2, y + 1.35, 4.1), "#465265", floor);
      addObstacle(new THREE.Vector3(0.28, 2.45, 0.9), new THREE.Vector3(3.2, y + 1.35, 8.45), "#465265", floor);
    }
    addObstacle(new THREE.Vector3(7.5, 2.45, 0.28), new THREE.Vector3(-7.2, y + 1.35, 1.1), "#465265", floor);
    addObstacle(new THREE.Vector3(7.5, 2.45, 0.28), new THREE.Vector3(7.2, y + 1.35, -1.1), "#465265", floor);

    addBox(new THREE.Vector3(2.1, 0.06, 1.4), new THREE.Vector3(-7, y + 0.04, 8.3), "#70d6ff", false);
    addBox(new THREE.Vector3(2.1, 0.06, 1.4), new THREE.Vector3(7, y + 0.04, -8.3), "#70d6ff", false);
  }

  const stairStepCount = 6;
  for (let step = 0; step < stairStepCount; step += 1) {
    const progress = step / (stairStepCount - 1);
    addBox(
      new THREE.Vector3(5.8, 0.18, 1.05),
      new THREE.Vector3(0, 0.18 + progress * floorHeights[1], stairBounds.minZ + progress * (stairBounds.maxZ - stairBounds.minZ)),
      step === stairStepCount - 1 ? "#7d899b" : "#667286"
    );
  }
  addBox(new THREE.Vector3(6.6, 0.18, 1.3), new THREE.Vector3(0, floorHeights[1] + 0.04, 7.35), "#7d899b");
  addBox(new THREE.Vector3(0.2, 3.05, 0.2), new THREE.Vector3(-3.2, 1.62, 4.4), "#a1a9b8");
  addBox(new THREE.Vector3(0.2, 3.05, 0.2), new THREE.Vector3(3.2, 1.62, 4.4), "#a1a9b8");
  addBox(new THREE.Vector3(0.16, 2.85, 5.3), new THREE.Vector3(-3.2, 1.8, 4.35), "#8b95a6");
  addBox(new THREE.Vector3(0.16, 2.85, 5.3), new THREE.Vector3(3.2, 1.8, 4.35), "#8b95a6");

  playerPosition.set(0, 0.65, 6);
  playerFloor = 0;
  yaw = Math.PI;
  pitch = -0.18;
  spawnPlayerCharacter();
  updateCamera();
}

function randomHousePoint(floor: number): THREE.Vector3 {
  const x = -8 + Math.random() * 16;
  const z = -6.8 + Math.random() * 13.6;
  return new THREE.Vector3(x, floorHeights[floor] + 0.55, z);
}

function assignRoles(): void {
  players.length = 0;
  players.push({ name: "You", role: "Innocent", alive: true });
  for (const name of botNames) {
    players.push({ name, role: "Innocent", alive: true });
  }

  const murdererIndexOptions = players.map((_, index) => index).filter((index) => index !== lastMurdererIndex);
  const murdererIndex = murdererIndexOptions[Math.floor(Math.random() * murdererIndexOptions.length)];
  let sheriffIndex = Math.floor(Math.random() * players.length);
  while (sheriffIndex === murdererIndex) {
    sheriffIndex = Math.floor(Math.random() * players.length);
  }

  players[murdererIndex].role = "Murderer";
  players[sheriffIndex].role = "Sheriff";
  lastMurdererIndex = murdererIndex;
  playerRole = players[0].role;
  playerAlive = true;
}

function spawnBots(): void {
  for (const bot of bots) {
    world.scene.remove(bot.mesh);
  }
  bots.length = 0;

  for (let i = 1; i < players.length; i += 1) {
    const record = players[i];
    const floor = i % 2;
    const mesh = createCharacter(botColors[record.role], record.name);
    mesh.position.copy(randomHousePoint(floor));
    world.scene.add(mesh);
    bots.push({
      record,
      mesh,
      target: randomHousePoint(floor),
      speed: 1.2 + Math.random() * 0.75,
      floor,
      waitTime: Math.random() * 1.5
    });
  }
}

function renderVoteCards(): void {
  voteGrid.textContent = "";
  mapOptions.forEach((option, index) => {
    const button = document.createElement("button");
    button.className = `vote-card${option.id === selectedMapId ? " selected" : ""}`;
    button.type = "button";
    button.style.setProperty("--map-color", option.color);
    button.innerHTML = `
      <span class="map-swatch" aria-hidden="true"></span>
      <span><strong>${option.name}</strong><span>${option.description}</span></span>
      <span class="vote-count">${option.id === selectedMapId ? 4 + index : index + 1}</span>
    `;
    button.addEventListener("click", () => {
      selectedMap = option;
      selectedMapId = option.id;
      renderVoteCards();
      buildLobby();
      showToast(`${option.name} selected`);
    });
    voteGrid.append(button);
  });
}

function updateHud(): void {
  phaseLabel.textContent = phase === "lobby" ? "Lobby" : phase === "round" ? selectedMap.name : "Results";
  timerLabel.textContent = phase === "round" ? `${Math.ceil(roundTime)}s remaining` : phase === "results" ? "Returning to lobby" : "Vote, then press Space";
  promptLabel.textContent =
    phase === "lobby"
      ? "Press Space to enter the selected map"
      : phase === "round"
        ? "Click the canvas to capture the mouse. Move mouse to look. W/S moves forward/back."
        : "Round complete";

  votePanel.classList.toggle("hidden", phase !== "lobby");
  crosshair.classList.toggle("active", phase === "round");
  roleChip.className = "role-chip";
  if (playerRole !== "Pending") {
    roleChip.classList.add(`role-${playerRole.toLowerCase()}`);
  }
  roleChip.textContent = playerRole === "Pending" ? "Role pending" : playerRole;

  playerList.textContent = "";
  for (const record of players) {
    const row = document.createElement("div");
    row.className = "player-row";
    const roleText = phase === "round" && record.name !== "You" ? (record.alive ? "Alive" : "Out") : record.role;
    row.innerHTML = `<span>${record.name}</span><span>${roleText}</span>`;
    playerList.append(row);
  }
}

function startRound(): void {
  phase = "round";
  roundTime = 150;
  assignRoles();
  buildHouse();
  spawnBots();
  void input.requestPointerLock();
  showToast(`You are the ${playerRole}`);
  updateHud();
}

function endRound(message: string): void {
  phase = "results";
  resultsTime = 6;
  input.exitPointerLock();
  showToast(message);
  updateHud();
}

function returnToLobby(): void {
  phase = "lobby";
  playerRole = "Pending";
  players.length = 1;
  players[0] = { name: "You", role: "Innocent", alive: true };
  for (const bot of bots) {
    world.scene.remove(bot.mesh);
  }
  bots.length = 0;
  buildLobby();
  updateHud();
}

function collides(position: THREE.Vector3, floor: number): boolean {
  const radius = 0.42;
  return obstacles.some((obstacle) => {
    if (obstacle.floor !== floor) {
      return false;
    }
    return (
      position.x + radius > obstacle.minX &&
      position.x - radius < obstacle.maxX &&
      position.z + radius > obstacle.minZ &&
      position.z - radius < obstacle.maxZ
    );
  });
}

function hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3, floor: number): boolean {
  if (Math.abs(from.y - to.y) > 2.4) {
    return false;
  }

  const distance = from.distanceTo(to);
  const steps = Math.max(3, Math.ceil(distance / 0.22));
  for (let step = 2; step < steps - 1; step += 1) {
    const t = step / steps;
    lineCheckPoint.lerpVectors(from, to, t);
    if (collides(lineCheckPoint, floor)) {
      return false;
    }
  }
  return true;
}

function moveActor(position: THREE.Vector3, delta: THREE.Vector3, floor: number): void {
  const nextX = position.clone();
  nextX.x += delta.x;
  if (!collides(nextX, floor)) {
    position.x = THREE.MathUtils.clamp(nextX.x, -10.1, 10.1);
  }

  const nextZ = position.clone();
  nextZ.z += delta.z;
  if (!collides(nextZ, floor)) {
    position.z = THREE.MathUtils.clamp(nextZ.z, -8.1, 8.1);
  }
}

function getStairProgress(position: THREE.Vector3): number | undefined {
  if (position.x < stairBounds.minX || position.x > stairBounds.maxX || position.z < stairBounds.minZ || position.z > stairBounds.maxZ) {
    return undefined;
  }
  return THREE.MathUtils.clamp((position.z - stairBounds.minZ) / (stairBounds.maxZ - stairBounds.minZ), 0, 1);
}

function updateActorFloorAndHeight(position: THREE.Vector3, currentFloor: number): number {
  const stairProgress = getStairProgress(position);
  if (stairProgress !== undefined) {
    position.y = 0.65 + stairProgress * floorHeights[1];
    return stairProgress > 0.5 ? 1 : 0;
  }

  position.y = floorHeights[currentFloor] + 0.65;
  return currentFloor;
}

function updateCamera(): void {
  const cameraDistance = 4.8;
  const cameraHeight = 0.95;
  const lookTarget = playerPosition.clone().add(new THREE.Vector3(0, 1.04, 0));
  const horizontalDistance = cameraDistance * Math.cos(Math.abs(pitch));
  const cameraOffset = new THREE.Vector3(
    Math.sin(yaw) * horizontalDistance,
    cameraHeight + Math.sin(-pitch) * 0.85,
    Math.cos(yaw) * horizontalDistance
  );

  world.camera.position.copy(lookTarget).add(cameraOffset);
  world.camera.position.y = THREE.MathUtils.clamp(world.camera.position.y, floorHeights[playerFloor] + 1.35, floorHeights[playerFloor] + 2.5);
  world.camera.lookAt(lookTarget);
}

function updatePlayer(dt: number): void {
  if (phase !== "round" || !playerAlive) {
    return;
  }

  if (input.pointer.movementX !== 0 || input.pointer.movementY !== 0) {
    yaw -= input.pointer.movementX * 0.0026;
    pitch += input.pointer.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -0.8, 0.55);
  }

  tempDirection.set(0, 0, 0);
  if (input.isKeyDown("KeyW")) tempDirection.z -= 1;
  if (input.isKeyDown("KeyS")) tempDirection.z += 1;
  if (input.isKeyDown("KeyA")) tempDirection.x -= 1;
  if (input.isKeyDown("KeyD")) tempDirection.x += 1;

  if (tempDirection.lengthSq() > 0) {
    tempDirection.normalize();
    forwardVector.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    rightVector.set(Math.cos(yaw), 0, -Math.sin(yaw));
    moveVector
      .copy(forwardVector)
      .multiplyScalar(-tempDirection.z)
      .add(rightVector.multiplyScalar(tempDirection.x));
    moveVector.y = 0;
    moveVector.normalize();
    moveVector.multiplyScalar(4.2 * dt);
    moveActor(playerPosition, moveVector, playerFloor);
    if (playerMesh) {
      playerMesh.rotation.y = Math.atan2(moveVector.x, moveVector.z);
    }
  }

  playerFloor = updateActorFloorAndHeight(playerPosition, playerFloor);

  if (playerMesh) {
    playerMesh.position.copy(playerPosition);
    playerMesh.visible = playerAlive;
  }
  updateCamera();
}

function updateBots(dt: number): void {
  for (const bot of bots) {
    if (!bot.record.alive) {
      bot.mesh.visible = false;
      continue;
    }

    const isMurderer = bot.record.role === "Murderer";
    if (isMurderer) {
      const livingTargets = [
        ...(playerAlive && playerRole !== "Murderer" ? [{ position: playerPosition, floor: playerFloor }] : []),
        ...bots
          .filter((target) => target !== bot && target.record.alive && target.record.role !== "Murderer")
          .map((target) => ({ position: target.mesh.position, floor: target.floor }))
      ];
      const sameFloorTargets = livingTargets.filter((target) => target.floor === bot.floor);
      const closestTarget = sameFloorTargets.sort((a, b) => bot.mesh.position.distanceTo(a.position) - bot.mesh.position.distanceTo(b.position))[0];
      if (closestTarget) {
        bot.target.copy(closestTarget.position);
      } else if (livingTargets.length > 0) {
        const otherFloorTarget = livingTargets[0];
        bot.target.set(0, floorHeights[bot.floor] + 0.65, otherFloorTarget.floor > bot.floor ? stairBounds.maxZ : stairBounds.minZ);
      }
    }

    const toTarget = bot.target.clone().sub(bot.mesh.position);
    if (toTarget.length() < 0.45) {
      bot.waitTime -= dt;
      if (bot.waitTime > 0 && !isMurderer) {
        continue;
      }
      bot.floor = Math.random() > 0.86 ? 1 - bot.floor : bot.floor;
      bot.target = randomHousePoint(bot.floor);
      bot.waitTime = 0.6 + Math.random() * 2.4;
      continue;
    }

    toTarget.y = 0;
    toTarget.normalize().multiplyScalar((isMurderer ? bot.speed * 1.22 : bot.speed) * dt);
    moveActor(bot.mesh.position, toTarget, bot.floor);
    bot.floor = updateActorFloorAndHeight(bot.mesh.position, bot.floor);
    bot.mesh.lookAt(bot.target.x, bot.mesh.position.y, bot.target.z);
  }
}

function nearestLivingBot(maxDistance: number): Bot | undefined {
  let nearest: Bot | undefined;
  let nearestDistance = maxDistance;
  for (const bot of bots) {
    if (!bot.record.alive || bot.floor !== playerFloor) {
      continue;
    }
    const distance = bot.mesh.position.distanceTo(playerPosition);
    if (distance < nearestDistance && hasLineOfSight(playerPosition, bot.mesh.position, playerFloor)) {
      nearest = bot;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function performAction(): void {
  if (phase !== "round" || !playerAlive || playerRole === "Pending") {
    return;
  }

  if (playerRole === "Murderer") {
    const target = nearestLivingBot(2.1);
    if (!target) {
      showToast("No one is close enough");
      return;
    }
    target.record.alive = false;
    showToast(`${target.record.name} eliminated`);
    return;
  }

  if (playerRole === "Sheriff") {
    world.camera.getWorldDirection(rayDirection);
    const raycaster = new THREE.Raycaster(world.camera.position, rayDirection, 0, 18);
    const hits = raycaster.intersectObjects(bots.map((bot) => bot.mesh), true);
    const hitMesh = hits[0]?.object;
    const hitBot = bots.find((bot) => hitMesh && (bot.mesh === hitMesh || bot.mesh.children.includes(hitMesh)));
    if (!hitBot || !hitBot.record.alive) {
      showToast("Shot missed");
      return;
    }
    if (hitBot.record.role === "Murderer") {
      hitBot.record.alive = false;
      endRound("Sheriff wins. The murderer was stopped.");
      return;
    }
    playerAlive = false;
    players[0].alive = false;
    endRound("Wrong shot. Innocents lose their Sheriff.");
    return;
  }

  showToast("Stay alive and watch the bots");
}

function botMurdererLogic(): void {
  const murderer = bots.find((bot) => bot.record.role === "Murderer" && bot.record.alive);
  if (!murderer) {
    return;
  }

  for (const target of bots) {
    if (target === murderer || !target.record.alive || target.record.role === "Murderer" || target.floor !== murderer.floor) {
      continue;
    }

    if (murderer.mesh.position.distanceTo(target.mesh.position) < 1.35 && hasLineOfSight(murderer.mesh.position, target.mesh.position, murderer.floor)) {
      target.record.alive = false;
      target.mesh.visible = false;
      showToast(`${murderer.record.name} eliminated ${target.record.name}`);
      return;
    }
  }

  if (!playerAlive || playerRole === "Murderer" || murderer.floor !== playerFloor) {
    return;
  }

  if (murderer.mesh.position.distanceTo(playerPosition) < 1.45 && hasLineOfSight(murderer.mesh.position, playerPosition, playerFloor)) {
    playerAlive = false;
    players[0].alive = false;
    endRound("The murderer caught you.");
  }
}

function checkWinConditions(): void {
  if (phase !== "round") {
    return;
  }

  const living = players.filter((record) => record.alive);
  const murdererAlive = living.some((record) => record.role === "Murderer");
  const nonMurderersAlive = living.some((record) => record.role !== "Murderer");

  if (!murdererAlive) {
    endRound("Innocents win.");
  } else if (!nonMurderersAlive) {
    endRound("Murderer wins.");
  } else if (roundTime <= 0) {
    endRound("Time expired. Innocents survive.");
  }
}

function update(dt: number): void {
  if (toastTime > 0) {
    toastTime -= dt;
    if (toastTime <= 0) {
      toast.classList.remove("visible");
    }
  }

  if (phase === "lobby" && input.wasKeyPressed("Space")) {
    startRound();
  }

  if (phase === "round") {
    roundTime -= dt;
    updatePlayer(dt);
    updateBots(dt);
    botMurdererLogic();
    if (input.wasMousePressed(0)) {
      if (!input.pointer.locked) {
        void input.requestPointerLock();
      } else {
        performAction();
      }
    }
    checkWinConditions();
  }

  if (phase === "results") {
    resultsTime -= dt;
    updateBots(dt);
    if (resultsTime <= 0) {
      returnToLobby();
    }
  }

  updateHud();
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.08);
  last = now;
  update(dt);
  world.render();
  input.endFrame();
  requestAnimationFrame(loop);
}

renderVoteCards();
returnToLobby();
requestAnimationFrame(loop);
