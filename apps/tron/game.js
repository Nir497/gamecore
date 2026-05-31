import * as THREE from "three";

const ARENA_SIZE = 75;
const HALF = Math.floor(ARENA_SIZE / 2);
const START_OFFSET = Math.floor(HALF * 0.62);
const CELL_SIZE = 1.2;
const TICK_MS = 95;
const RIDER_FOV = 96;
const CHASE_DISTANCE = 9.2;
const CHASE_HEIGHT = 5.2;
const CHASE_LOOK_AHEAD = 15.5;
const CHASE_LOOK_HEIGHT = 0.72;
const PLANNING_MARKER_COUNT = 6;
const WALL_HEIGHT = 2.4;
const DIRECTIONS = {
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  forward: new THREE.Vector3(0, 0, -1),
  back: new THREE.Vector3(0, 0, 1)
};
const BOT_CONFIG = {
  cols: ARENA_SIZE,
  rows: ARENA_SIZE
};
const BOT_DIRECTIONS = {
  right: { x: 1, y: 0, opposite: "left" },
  left: { x: -1, y: 0, opposite: "right" },
  up: { x: 0, y: -1, opposite: "down" },
  down: { x: 0, y: 1, opposite: "up" }
};

const COLORS = {
  p1: {
    head: 0x00ffff,
    trail: 0x006688,
    glow: "#00ffff"
  },
  p2: {
    head: 0xff9900,
    trail: 0x884400,
    glow: "#ff9900"
  }
};

const canvas = document.querySelector("#gameCanvas");
const minimapCanvas = document.querySelector("#minimapCanvas");
const minimapContext = minimapCanvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const panel = document.querySelector("#panel");
const p1ScoreEl = document.querySelector("#p1Score");
const p2ScoreEl = document.querySelector("#p2Score");
const p2NameLabel = document.querySelector("#p2NameLabel");
const p1ViewportLabel = document.querySelector("#p1ViewportLabel");
const p2ViewportLabel = document.querySelector("#p2ViewportLabel");
const roundStateEl = document.querySelector("#roundState");
const matchModeEl = document.querySelector("#matchMode");
const app = document.querySelector("#app");
const devLogVerbose = new URLSearchParams(window.location.search).has("devLog");
const devLogEndpoint = "/__movement-log";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x02080c, 0.012);

const overviewCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 260);
const riderCameras = [
  new THREE.PerspectiveCamera(RIDER_FOV, window.innerWidth / 2 / window.innerHeight, 0.06, 220),
  new THREE.PerspectiveCamera(RIDER_FOV, window.innerWidth / 2 / window.innerHeight, 0.06, 220)
];
const riderCameraTargets = [
  {
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3()
  },
  {
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3()
  }
];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
const minimapPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

const arenaGroup = new THREE.Group();
const trailGroup = new THREE.Group();
const cycleGroup = new THREE.Group();
const planningGroup = new THREE.Group();
scene.add(arenaGroup, trailGroup, cycleGroup, planningGroup);

const ambientLight = new THREE.AmbientLight(0x6bb8ff, 0.35);
const cyanLight = new THREE.PointLight(0x00ffff, 1.8, 48);
cyanLight.position.set(-10, 9, 10);
const orangeLight = new THREE.PointLight(0xff9900, 1.5, 48);
orangeLight.position.set(10, 7, -8);
scene.add(ambientLight, cyanLight, orangeLight);

const sounds = {
  countdown: new Audio("assets/sound/countdown-beep.wav"),
  start: new Audio("assets/sound/round-start.wav"),
  turn: new Audio("assets/sound/turn-blip.wav"),
  crash: new Audio("assets/sound/crash.wav"),
  win: new Audio("assets/sound/round-win.wav"),
  draw: new Audio("assets/sound/round-draw.wav"),
  menu: new Audio("assets/sound/menu-select.wav"),
  engine: new Audio("assets/sound/engine-loop.wav")
};
sounds.engine.loop = true;
const soundVolumes = {
  countdown: 0.5,
  start: 0.62,
  turn: 0.46,
  crash: 0.82,
  win: 0.68,
  draw: 0.62,
  menu: 0.42,
  engine: 0.24
};
Object.entries(sounds).forEach(([name, sound]) => {
  sound.preload = "auto";
  sound.volume = soundVolumes[name] ?? 0.5;
});

let players;
let occupied;
let trailCells;
let running = false;
let gamePhase = "idle";
let lastTick = 0;
let accumulator = 0;
let scores = { p1: 0, p2: 0 };
let submittedScore = false;
let opponentMode = "bot";
let botDifficulty = "hard";
let logSequence = 0;
let movementTick = 0;
let devLogFileHandle = null;
let devLogFlushTimer = 0;
let devLogServerWarned = false;
let audioContext = null;
let masterGain = null;
let lastMoveSoundAt = 0;
let lastDangerSoundAt = 0;
const devLogLines = [];
const planningMarkers = [];

function setPhase(phase) {
  gamePhase = phase;
  app.classList.toggle("playing", phase === "playing");
  app.classList.toggle("ended", phase === "ended");
}

function opponentLabel() {
  return opponentMode === "bot" ? "BOT" : "P2";
}

function updateModeUi() {
  const isBotMode = opponentMode === "bot";
  app.classList.toggle("single-view", isBotMode);
  p2NameLabel.textContent = isBotMode ? "BOT" : "P2";
  p1ViewportLabel.textContent = isBotMode ? "RIDER POV" : "P1 RIDER POV";
  p2ViewportLabel.textContent = isBotMode ? "" : "P2 RIDER POV";
}

function directionName(direction) {
  if (direction.equals(DIRECTIONS.right)) {
    return "right";
  }
  if (direction.equals(DIRECTIONS.left)) {
    return "left";
  }
  if (direction.equals(DIRECTIONS.forward)) {
    return "forward";
  }
  if (direction.equals(DIRECTIONS.back)) {
    return "back";
  }
  return `unknown(${direction.x},${direction.y},${direction.z})`;
}

function formatGrid(position) {
  return `(${position.x},${position.z})`;
}

function appendLog(message, type = "system") {
  logSequence += 1;
  const time = new Date().toISOString();
  const line = `${String(logSequence).padStart(4, "0")} ${time} [${type}] ${message}`;
  devLogLines.push(line);
  if (devLogVerbose) {
    console.debug(`[tron-dev-log] ${line}`);
  }
  writeDevLogLineToServer(line);
  scheduleDevLogFileFlush();
}

function clearEventLog() {
  devLogLines.length = 0;
  logSequence = 0;
  clearServerDevLog();
  appendLog("log cleared", "system");
}

function writeDevLogLineToServer(line) {
  fetch(devLogEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain"
    },
    body: `${line}\n`,
    keepalive: true
  }).then((response) => {
    if (!response.ok && !devLogServerWarned) {
      devLogServerWarned = true;
      console.warn("movementlogs.txt is not being written. Serve this folder with node server.js for automatic file logging.");
    }
  }).catch(() => {
    if (!devLogServerWarned) {
      devLogServerWarned = true;
      console.warn("movementlogs.txt is not being written. Serve this folder with node server.js for automatic file logging.");
    }
  });
}

function clearServerDevLog() {
  fetch(`${devLogEndpoint}/clear`, {
    method: "POST",
    keepalive: true
  }).catch(() => {});
}

function devLogText() {
  return `${devLogLines.join("\n")}\n`;
}

function downloadDevLog() {
  const url = URL.createObjectURL(new Blob([devLogText()], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `tron-dev-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

async function writeDevLogFile() {
  if (!devLogFileHandle) {
    return;
  }
  const writable = await devLogFileHandle.createWritable();
  await writable.write(devLogText());
  await writable.close();
}

function scheduleDevLogFileFlush() {
  if (!devLogFileHandle || devLogFlushTimer) {
    return;
  }
  devLogFlushTimer = window.setTimeout(() => {
    devLogFlushTimer = 0;
    writeDevLogFile().catch((error) => {
      console.error("Failed to write Tron dev log file", error);
    });
  }, 120);
}

async function chooseDevLogFile() {
  if (!window.showSaveFilePicker) {
    downloadDevLog();
    return "downloaded";
  }
  devLogFileHandle = await window.showSaveFilePicker({
    suggestedName: `tron-dev-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
    types: [
      {
        description: "Text log",
        accept: {
          "text/plain": [".txt"]
        }
      }
    ]
  });
  await writeDevLogFile();
  return "file-selected";
}

function playSound(name) {
  const sound = sounds[name];
  if (!sound) {
    return;
  }
  unlockAudio();
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function unlockAudio() {
  if (audioContext) {
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.18;
  masterGain.connect(audioContext.destination);
}

function playTone({ frequency, endFrequency = frequency, duration = 0.08, type = "sine", gain = 0.18 }) {
  unlockAudio();
  if (!audioContext || !masterGain) {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const toneGain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
  toneGain.gain.setValueAtTime(0.0001, now);
  toneGain.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(toneGain);
  toneGain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playMovePulse() {
  const now = performance.now();
  if (now - lastMoveSoundAt < 75) {
    return;
  }
  lastMoveSoundAt = now;
  playTone({ frequency: 88, endFrequency: 116, duration: 0.045, type: "square", gain: 0.055 });
}

function playDangerPulse() {
  const now = performance.now();
  if (now - lastDangerSoundAt < 420) {
    return;
  }
  lastDangerSoundAt = now;
  playTone({ frequency: 360, endFrequency: 170, duration: 0.16, type: "sawtooth", gain: 0.08 });
}

function playBotPulse() {
  playTone({ frequency: 430, endFrequency: 520, duration: 0.055, type: "triangle", gain: 0.045 });
}

function createArena() {
  const sideLength = ARENA_SIZE * CELL_SIZE;
  const halfWorld = HALF * CELL_SIZE;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(sideLength, sideLength),
    new THREE.MeshStandardMaterial({
      color: 0x02070a,
      emissive: 0x001722,
      emissiveIntensity: 0.8,
      roughness: 0.62,
      metalness: 0.15
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  arenaGroup.add(floor);

  const grid = new THREE.GridHelper(sideLength, ARENA_SIZE, 0x00d8ff, 0x12323c);
  grid.position.y = 0.015;
  grid.material.transparent = true;
  grid.material.opacity = 0.62;
  arenaGroup.add(grid);

  const warningGrid = new THREE.GridHelper(sideLength, Math.max(4, Math.floor(ARENA_SIZE / 3)), 0xff1744, 0x2b0008);
  warningGrid.position.y = 0.02;
  warningGrid.material.transparent = true;
  warningGrid.material.opacity = 0.36;
  arenaGroup.add(warningGrid);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xff1f36,
    emissive: 0xff1028,
    emissiveIntensity: 1.8,
    roughness: 0.32,
    metalness: 0.25
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x220006,
    emissive: 0xff1028,
    emissiveIntensity: 0.34,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide
  });

  const railGeometryX = new THREE.BoxGeometry(sideLength + CELL_SIZE, 0.26, 0.26);
  const railGeometryZ = new THREE.BoxGeometry(0.26, 0.26, sideLength + CELL_SIZE);
  const wallGeometryX = new THREE.BoxGeometry(sideLength + CELL_SIZE, WALL_HEIGHT, 0.12);
  const wallGeometryZ = new THREE.BoxGeometry(0.12, WALL_HEIGHT, sideLength + CELL_SIZE);
  [
    { geometry: railGeometryX, position: [0, 0.16, -halfWorld - CELL_SIZE * 0.5] },
    { geometry: railGeometryX, position: [0, 0.16, halfWorld + CELL_SIZE * 0.5] },
    { geometry: railGeometryZ, position: [-halfWorld - CELL_SIZE * 0.5, 0.16, 0] },
    { geometry: railGeometryZ, position: [halfWorld + CELL_SIZE * 0.5, 0.16, 0] }
  ].forEach(({ geometry, position }) => {
    const rail = new THREE.Mesh(geometry, railMaterial);
    rail.position.set(...position);
    arenaGroup.add(rail);
  });
  [
    { geometry: wallGeometryX, position: [0, WALL_HEIGHT / 2, -halfWorld - CELL_SIZE * 0.5] },
    { geometry: wallGeometryX, position: [0, WALL_HEIGHT / 2, halfWorld + CELL_SIZE * 0.5] },
    { geometry: wallGeometryZ, position: [-halfWorld - CELL_SIZE * 0.5, WALL_HEIGHT / 2, 0] },
    { geometry: wallGeometryZ, position: [halfWorld + CELL_SIZE * 0.5, WALL_HEIGHT / 2, 0] }
  ].forEach(({ geometry, position }) => {
    const wall = new THREE.Mesh(geometry, wallMaterial);
    wall.position.set(...position);
    arenaGroup.add(wall);
  });

  const starMaterial = new THREE.PointsMaterial({ color: 0x8fdfff, size: 0.035, transparent: true, opacity: 0.45 });
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 700; i += 1) {
    starPositions.push((Math.random() - 0.5) * 190, Math.random() * 72 + 16, (Math.random() - 0.5) * 190);
  }
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeometry, starMaterial));
}

function createPlanningMarkers() {
  players.forEach((player) => {
    const playerMarkers = [];
    const color = new THREE.Color(player.colorSet.head);
    for (let i = 0; i < PLANNING_MARKER_COUNT; i += 1) {
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE * 0.82, CELL_SIZE * 0.82),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.26 - i * 0.028,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.036 + i * 0.002;
      marker.visible = false;
      planningGroup.add(marker);
      playerMarkers.push(marker);
    }
    planningMarkers.push(playerMarkers);
  });
}

function updatePlanningMarkers() {
  if (!players || planningMarkers.length !== players.length) {
    return;
  }
  players.forEach((player, playerIndex) => {
    const markers = planningMarkers[playerIndex];
    if (!markers) {
      return;
    }
    for (let i = 0; i < markers.length; i += 1) {
      const marker = markers[i];
      const cell = {
        x: player.position.x + player.direction.x * (i + 1),
        y: 0,
        z: player.position.z + player.direction.z * (i + 1)
      };
      const key = positionKey(cell);
      const blocked = occupied.has(key);
      marker.visible = gamePhase === "playing" && player.alive && inBounds(cell);
      marker.position.copy(gridToWorld(cell));
      marker.position.y = 0.036 + i * 0.002;
      marker.material.color.set(blocked ? 0xff2448 : player.colorSet.head);
      marker.material.opacity = blocked ? 0.46 : 0.28 - i * 0.028;
    }
  });
}

function resizeMinimap() {
  const bounds = minimapCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width * minimapPixelRatio));
  const height = Math.max(1, Math.round(bounds.height * minimapPixelRatio));
  if (minimapCanvas.width !== width || minimapCanvas.height !== height) {
    minimapCanvas.width = width;
    minimapCanvas.height = height;
  }
}

function minimapPoint(position, originX, originY, cellSize) {
  return {
    x: originX + (position.x + HALF + 0.5) * cellSize,
    y: originY + (position.z + HALF + 0.5) * cellSize
  };
}

function drawMinimap() {
  if (!minimapContext || !players || !trailCells) {
    return;
  }
  resizeMinimap();
  const width = minimapCanvas.width;
  const height = minimapCanvas.height;
  const padding = Math.round(10 * minimapPixelRatio);
  const size = Math.min(width, height) - padding * 2;
  const cellSize = size / ARENA_SIZE;
  const originX = (width - size) / 2;
  const originY = (height - size) / 2;

  minimapContext.clearRect(0, 0, width, height);
  minimapContext.fillStyle = "rgba(0, 6, 8, 0.92)";
  minimapContext.fillRect(0, 0, width, height);
  minimapContext.strokeStyle = "rgba(0, 255, 255, 0.18)";
  minimapContext.lineWidth = Math.max(1, minimapPixelRatio);
  minimapContext.strokeRect(originX, originY, size, size);

  minimapContext.beginPath();
  for (let i = 0; i <= ARENA_SIZE; i += 5) {
    const line = originX + i * cellSize;
    const row = originY + i * cellSize;
    minimapContext.moveTo(line, originY);
    minimapContext.lineTo(line, originY + size);
    minimapContext.moveTo(originX, row);
    minimapContext.lineTo(originX + size, row);
  }
  minimapContext.strokeStyle = "rgba(255, 255, 255, 0.07)";
  minimapContext.lineWidth = Math.max(1, minimapPixelRatio * 0.6);
  minimapContext.stroke();

  trailCells.forEach((playerId, key) => {
    const [x, z] = key.split(",").map(Number);
    const color = playerId === "p1" ? COLORS.p1.glow : COLORS.p2.glow;
    minimapContext.fillStyle = color;
    minimapContext.globalAlpha = 0.72;
    minimapContext.fillRect(
      originX + (x + HALF) * cellSize,
      originY + (z + HALF) * cellSize,
      Math.max(1, cellSize),
      Math.max(1, cellSize)
    );
  });
  minimapContext.globalAlpha = 1;

  players.forEach((player) => {
    const point = minimapPoint(player.position, originX, originY, cellSize);
    const color = player.id === "p1" ? COLORS.p1.glow : COLORS.p2.glow;
    const radius = Math.max(4 * minimapPixelRatio, cellSize * 1.8);
    minimapContext.fillStyle = color;
    minimapContext.strokeStyle = "#ffffff";
    minimapContext.lineWidth = Math.max(1, minimapPixelRatio);
    minimapContext.beginPath();
    minimapContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    minimapContext.fill();
    minimapContext.stroke();

    minimapContext.beginPath();
    minimapContext.moveTo(point.x, point.y);
    minimapContext.lineTo(
      point.x + player.direction.x * radius * 2,
      point.y + player.direction.z * radius * 2
    );
    minimapContext.strokeStyle = color;
    minimapContext.lineWidth = Math.max(2, minimapPixelRatio * 2);
    minimapContext.stroke();
  });
}

function gridToWorld(position) {
  return new THREE.Vector3(position.x * CELL_SIZE, position.y * CELL_SIZE, position.z * CELL_SIZE);
}

function positionKey(position) {
  return `${position.x},${position.z}`;
}

function cloneGrid(position) {
  return { x: position.x, y: position.y, z: position.z };
}

function addGrid(position, direction) {
  return {
    x: position.x + direction.x,
    y: position.y + direction.y,
    z: position.z + direction.z
  };
}

function inBounds(position) {
  return Math.abs(position.x) <= HALF && Math.abs(position.z) <= HALF;
}

function isBlocked(position) {
  return !inBounds(position) || occupied.has(positionKey(position));
}

function hasDangerAhead(player, steps = 3) {
  for (let i = 1; i <= steps; i += 1) {
    const position = {
      x: player.position.x + player.pendingDirection.x * i,
      y: 0,
      z: player.position.z + player.pendingDirection.z * i
    };
    if (isBlocked(position)) {
      return true;
    }
  }
  return false;
}

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0 && a.z + b.z === 0;
}

function turnLeft(direction) {
  return new THREE.Vector3(direction.z, 0, -direction.x);
}

function turnRight(direction) {
  return new THREE.Vector3(-direction.z, 0, direction.x);
}

function directionForControl(player, control) {
  if (control === "straight") {
    return player.direction.clone();
  }
  if (control === "left") {
    return turnLeft(player.direction);
  }
  if (control === "right") {
    return turnRight(player.direction);
  }
  if (control === "reverse") {
    return player.direction.clone().multiplyScalar(-1);
  }
  return null;
}

function makeCycle(id, colorSet, start, direction) {
  const material = new THREE.MeshStandardMaterial({
    color: colorSet.head,
    emissive: colorSet.head,
    emissiveIntensity: 1.4,
    roughness: 0.28,
    metalness: 0.25
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.54, 1.75), material);
  body.position.y = 0.36;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.8, 4), material);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.36, -1.05);
  const group = new THREE.Group();
  group.add(body, nose);
  group.position.copy(gridToWorld(start));
  cycleGroup.add(group);

  return {
    id,
    colorSet,
    position: cloneGrid(start),
    direction: direction.clone(),
    pendingDirection: direction.clone(),
    renderPosition: gridToWorld(start),
    renderDirection: direction.clone(),
    mesh: group,
    alive: true
  };
}

function resetRound() {
  trailGroup.clear();
  cycleGroup.clear();
  occupied = new Set();
  trailCells = new Map();
  movementTick = 0;
  players = [
    makeCycle("p1", COLORS.p1, { x: -START_OFFSET, y: 0, z: 0 }, DIRECTIONS.right),
    makeCycle("p2", COLORS.p2, { x: START_OFFSET, y: 0, z: 0 }, DIRECTIONS.left)
  ];
  players.forEach((player) => {
    const key = positionKey(player.position);
    occupied.add(key);
    trailCells.set(key, player.id);
  });
  updateCycleMeshes();
  appendLog(`round reset: P1 ${formatGrid(players[0].position)} -> ${directionName(players[0].direction)}, P2 ${formatGrid(players[1].position)} -> ${directionName(players[1].direction)}`, "system");
}

function createTrailSegment(player, from, to) {
  const start = gridToWorld(from);
  const end = gridToWorld(to);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end) + 0.16;
  const geometry = new THREE.BoxGeometry(0.28, WALL_HEIGHT, length);
  const material = new THREE.MeshStandardMaterial({
    color: player.colorSet.trail,
    emissive: player.colorSet.head,
    emissiveIntensity: 0.72,
    transparent: true,
    opacity: 0.88,
    roughness: 0.4
  });
  const segment = new THREE.Mesh(geometry, material);
  segment.position.copy(midpoint);
  segment.position.y = WALL_HEIGHT / 2;
  segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), end.clone().sub(start).normalize());
  trailGroup.add(segment);
}

function updateCycleMeshes() {
  players.forEach((player) => {
    const target = gridToWorld(player.position);
    player.renderPosition.copy(target);
    player.renderDirection.copy(player.direction);
    player.mesh.position.copy(player.renderPosition);
    player.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), player.renderDirection.clone().normalize());
    player.mesh.visible = player.alive;
  });
}

function updateCycleVisuals() {
  players.forEach((player) => {
    const target = gridToWorld(player.position);
    player.renderPosition.lerp(target, 0.34);
    player.renderDirection.lerp(player.direction, 0.42).normalize();
    player.mesh.position.copy(player.renderPosition);
    player.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), player.renderDirection.clone().normalize());
    player.mesh.visible = player.alive;
  });
}

function setDirection(player, direction) {
  if (!running) {
    return {
      accepted: false,
      reason: `game phase is ${gamePhase}`
    };
  }
  if (!player.alive) {
    return {
      accepted: false,
      reason: `${player.id.toUpperCase()} is not alive`
    };
  }
  if (isOpposite(player.direction, direction)) {
    return {
      accepted: false,
      reason: `U-turn rejected from ${directionName(player.direction)} to ${directionName(direction)}`
    };
  }
  if (!player.pendingDirection.equals(direction)) {
    playSound("turn");
  }
  player.pendingDirection.copy(direction);
  return {
    accepted: true,
    reason: `pending direction set to ${directionName(direction)}`
  };
}

function controlFromKey(event) {
  const key = event.key.toLowerCase();
  const p1Map = {
    d: "right",
    a: "left",
    w: "straight",
    s: "reverse"
  };
  const p2Map = {
    arrowright: "right",
    arrowleft: "left",
    arrowup: "straight",
    arrowdown: "reverse"
  };
  if (p1Map[key]) {
    return { playerIndex: 0, control: p1Map[key] };
  }
  if (p2Map[key]) {
    return { playerIndex: opponentMode === "bot" ? 0 : 1, control: p2Map[key] };
  }
  return null;
}

function botDirectionNameFromVector(direction) {
  if (direction.equals(DIRECTIONS.right)) {
    return "right";
  }
  if (direction.equals(DIRECTIONS.left)) {
    return "left";
  }
  if (direction.equals(DIRECTIONS.forward)) {
    return "up";
  }
  return "down";
}

function botVectorFromDirectionName(direction) {
  const map = {
    right: DIRECTIONS.right,
    left: DIRECTIONS.left,
    up: DIRECTIONS.forward,
    down: DIRECTIONS.back
  };
  return map[direction].clone();
}

function gridToBotPosition(position) {
  return {
    x: position.x + HALF,
    y: position.z + HALF
  };
}

function makeBotGrid() {
  const grid = Array.from({ length: BOT_CONFIG.rows }, () => Array(BOT_CONFIG.cols).fill(0));
  trailCells.forEach((playerId, key) => {
    const [gridX, gridZ] = key.split(",").map(Number);
    const x = gridX + HALF;
    const y = gridZ + HALF;
    if (x >= 0 && y >= 0 && x < BOT_CONFIG.cols && y < BOT_CONFIG.rows) {
      grid[y][x] = playerId === "p2" ? 2 : 1;
    }
  });
  players.forEach((player) => {
    const position = gridToBotPosition(player.position);
    grid[position.y][position.x] = player.id === "p2" ? 2 : 1;
  });
  return grid;
}

function makeBotPlayer(player) {
  const position = gridToBotPosition(player.position);
  return {
    x: position.x,
    y: position.y,
    direction: botDirectionNameFromVector(player.direction)
  };
}

function makeBotGameState() {
  return {
    grid: makeBotGrid(),
    players: {
      p1: makeBotPlayer(players[0]),
      p2: makeBotPlayer(players[1])
    }
  };
}

class TronBotBrain {
  constructor(game, playerId = "p2", opponentId = "p1") {
    this.game = game;
    this.playerId = playerId;
    this.opponentId = opponentId;
  }

  getMove(difficulty) {
    const player = this.game.players[this.playerId];
    const candidates = this.getSafeMoves(player);
    if (candidates.length === 0) {
      return player.direction;
    }
    return difficulty === "easy" ? this.chooseEasyMove(candidates) : this.chooseHardMove(candidates);
  }

  chooseEasyMove(candidates) {
    const opponent = this.game.players[this.opponentId];
    const opponentMoves = this.getSafeMoves(opponent);
    const fallback = {
      direction: opponent.direction,
      next: this.previewMove(opponent, opponent.direction)
    };
    const sample = opponentMoves.length > 0
      ? opponentMoves[Math.floor(Math.random() * opponentMoves.length)]
      : fallback;

    const scored = candidates.map((candidate) => {
      if (this.isCollisionOnGrid(this.game.grid, sample.next.x, sample.next.y)) {
        return { direction: candidate.direction, score: 50000 };
      }
      const grid = this.game.grid.map((row) => row.slice());
      grid[candidate.next.y][candidate.next.x] = 2;
      grid[sample.next.y][sample.next.x] = 1;
      return {
        direction: candidate.direction,
        score: this.evaluateEasyState(candidate.next, candidate.direction, sample.next, sample.direction, grid)
      };
    });

    scored.sort((left, right) => right.score - left.score);
    if (Math.random() < 0.24) {
      const pool = scored.slice(0, Math.min(3, scored.length));
      return pool[Math.floor(Math.random() * pool.length)].direction;
    }
    return scored[0].direction;
  }

  chooseHardMove(candidates) {
    let bestScore = -Infinity;
    let bestDirections = [];
    for (const candidate of candidates) {
      const score = this.evaluateHardMove(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestDirections = [candidate.direction];
      } else if (score === bestScore) {
        bestDirections.push(candidate.direction);
      }
    }
    return bestDirections[Math.floor(Math.random() * bestDirections.length)];
  }

  evaluateEasyState(botPosition, botDirection, opponentPosition, opponentDirection, grid) {
    const botSpace = this.floodFillOnGrid(botPosition.x, botPosition.y, grid);
    const opponentSpace = this.floodFillOnGrid(opponentPosition.x, opponentPosition.y, grid);
    if (botSpace === 0) {
      return -100000;
    }
    if (opponentSpace === 0) {
      return 100000;
    }
    if (botSpace < 10) {
      return -50000 + botSpace * 1000;
    }

    const projectedSafety = this.projectedSafety(botPosition, botDirection, grid, 12);
    if (projectedSafety < 30) {
      return -20000 + projectedSafety * 600;
    }
    if (botSpace > 60 && projectedSafety < botSpace * 0.35) {
      return -18000 + projectedSafety * 200;
    }

    const botCorridorRisk = this.measureCorridorRisk(botPosition, grid);
    if (botCorridorRisk > 20) {
      return -15000 + (40 - Math.min(botCorridorRisk, 40)) * 250;
    }

    const botEscape = this.measureEscapePotential(botPosition, botDirection, grid);
    const opponentEscape = this.measureEscapePotential(opponentPosition, opponentDirection, grid);
    const botMobility = this.countSafeTurns(botPosition, botDirection, grid);
    const opponentMobility = this.countSafeTurns(opponentPosition, opponentDirection, grid);
    const opponentCorridorRisk = this.measureCorridorRisk(opponentPosition, grid);
    const pressure = (botSpace - opponentSpace) + (botMobility - opponentMobility) * 18;
    const distanceToOpponent = Math.abs(botPosition.x - opponentPosition.x) + Math.abs(botPosition.y - opponentPosition.y);
    const vector = BOT_DIRECTIONS[botDirection];
    const approach = vector.x * Math.sign(opponentPosition.x - botPosition.x) + vector.y * Math.sign(opponentPosition.y - botPosition.y);
    const avoidApproach = distanceToOpponent < 10 ? -approach * (10 - distanceToOpponent) * 20 : 0;
    const consistency = botSpace > 800 ? 150 : botSpace > 300 ? 80 : 35;
    const serpentine = this.countOwnTrailNeighbors(botPosition, grid) === 2 ? 90 : 0;
    const emptyCount = this.countEmptyCells(grid);
    const separated = botSpace + opponentSpace <= emptyCount + 20;

    if (separated) {
      return botSpace * 2 + projectedSafety * 0.8 + botEscape * 0.5 - botCorridorRisk * 3 + consistency + serpentine * 1.5;
    }

    const territory = this.computeTerritoryControl(botPosition, opponentPosition, grid);
    return (
      territory * 0.95 +
      (botSpace - opponentSpace) * 1.25 +
      projectedSafety * 0.4 +
      (botEscape - opponentEscape) * 41.25 +
      (botMobility - opponentMobility) * 72 +
      (opponentCorridorRisk - botCorridorRisk) * 19.25 -
      botCorridorRisk * 5 +
      pressure * 0.45 +
      this.computeCenterControl(botPosition, opponentPosition) * 8 +
      avoidApproach +
      consistency +
      serpentine
    );
  }

  evaluateHardMove(botCandidate) {
    const opponent = this.game.players[this.opponentId];
    const opponentMoves = this.getSafeMoves(opponent);
    const fallback = {
      direction: opponent.direction,
      next: this.previewMove(opponent, opponent.direction)
    };
    const responses = opponentMoves.length > 0 ? opponentMoves : [fallback];
    let worstCase = Infinity;
    let aggregate = 0;

    for (const response of responses) {
      const score = this.scoreHardFutureState(botCandidate, response);
      aggregate += score;
      worstCase = Math.min(worstCase, score);
    }

    return worstCase * 0.9 + (aggregate / responses.length) * 0.1;
  }

  scoreHardFutureState(botCandidate, opponentCandidate) {
    const gridAfterBotMove = this.cloneGridWithMoves(botCandidate.next);
    const botCrash = this.isCollisionOnGrid(this.game.grid, botCandidate.next.x, botCandidate.next.y);
    const opponentCrash = this.isCollisionOnGrid(gridAfterBotMove, opponentCandidate.next.x, opponentCandidate.next.y);
    const headOn = botCandidate.next.x === opponentCandidate.next.x && botCandidate.next.y === opponentCandidate.next.y;

    if (headOn) {
      return -65000;
    }
    if (botCrash && opponentCrash) {
      return -250;
    }
    if (botCrash) {
      return -100000;
    }
    if (opponentCrash) {
      return 100000;
    }

    const futureGrid = this.cloneGridWithMoves(botCandidate.next, opponentCandidate.next);
    const territory = this.computeTerritoryControl(botCandidate.next, opponentCandidate.next, futureGrid);
    const botSpace = this.floodFillOnGrid(botCandidate.next.x, botCandidate.next.y, futureGrid);
    const opponentSpace = this.floodFillOnGrid(opponentCandidate.next.x, opponentCandidate.next.y, futureGrid);
    const botMobility = this.countSafeTurns(botCandidate.next, botCandidate.direction, futureGrid);
    const opponentMobility = this.countSafeTurns(opponentCandidate.next, opponentCandidate.direction, futureGrid);
    const botEscape = this.measureEscapePotential(botCandidate.next, botCandidate.direction, futureGrid);
    const opponentEscape = this.measureEscapePotential(opponentCandidate.next, opponentCandidate.direction, futureGrid);
    const botCorridorRisk = this.measureCorridorRisk(botCandidate.next, futureGrid);
    const opponentCorridorRisk = this.measureCorridorRisk(opponentCandidate.next, futureGrid);
    const pressure = (botSpace - opponentSpace) + (botMobility - opponentMobility) * 18;
    const centerControl = this.computeCenterBias(botCandidate.next) - this.computeCenterBias(opponentCandidate.next);

    return (
      territory * 0.95 +
      (botSpace - opponentSpace) * 1.25 +
      (botMobility - opponentMobility) * 72 +
      (botEscape - opponentEscape) * 41.25 +
      (opponentCorridorRisk - botCorridorRisk) * 19.25 +
      pressure * 0.45 +
      centerControl * 8
    );
  }

  getCandidateDirections(currentDirection) {
    return Object.keys(BOT_DIRECTIONS).filter((direction) => direction !== BOT_DIRECTIONS[currentDirection].opposite);
  }

  previewMove(player, direction) {
    const vector = BOT_DIRECTIONS[direction];
    return {
      x: player.x + vector.x,
      y: player.y + vector.y
    };
  }

  getSafeMoves(player, grid = this.game.grid) {
    const candidates = this.getCandidateDirections(player.direction)
      .map((direction) => ({
        direction,
        next: this.previewMove(player, direction)
      }))
      .filter((candidate) => !this.isCollisionOnGrid(grid, candidate.next.x, candidate.next.y));
    const nonSuicidal = candidates.filter((candidate) => {
      const freeNeighbors = Object.values(BOT_DIRECTIONS)
        .map((direction) => ({
          x: candidate.next.x + direction.x,
          y: candidate.next.y + direction.y
        }))
        .filter((neighbor) => {
          if (neighbor.x === player.x && neighbor.y === player.y) {
            return false;
          }
          return !this.isCollisionOnGrid(grid, neighbor.x, neighbor.y);
        }).length;
      return freeNeighbors > 0;
    });
    return nonSuicidal.length > 0 ? nonSuicidal : candidates;
  }

  cloneGridWithMoves(botNext, opponentNext) {
    const grid = this.game.grid.map((row) => row.slice());
    if (this.isInside(botNext.x, botNext.y)) {
      grid[botNext.y][botNext.x] = 2;
    }
    if (opponentNext && this.isInside(opponentNext.x, opponentNext.y)) {
      grid[opponentNext.y][opponentNext.x] = 1;
    }
    return grid;
  }

  isInside(x, y) {
    return x >= 0 && y >= 0 && x < BOT_CONFIG.cols && y < BOT_CONFIG.rows;
  }

  isCollisionOnGrid(grid, x, y) {
    if (!this.isInside(x, y)) {
      return true;
    }
    return grid[y][x] !== 0;
  }

  floodFillOnGrid(startX, startY, grid) {
    if (!this.isInside(startX, startY)) {
      return 0;
    }
    const seen = new Uint8Array(BOT_CONFIG.cols * BOT_CONFIG.rows);
    const queue = [startY * BOT_CONFIG.cols + startX];
    let head = 0;
    let count = 0;

    while (head < queue.length) {
      const index = queue[head];
      head += 1;
      if (seen[index]) {
        continue;
      }
      const x = index % BOT_CONFIG.cols;
      const y = Math.floor(index / BOT_CONFIG.cols);
      if ((x !== startX || y !== startY) && this.isCollisionOnGrid(grid, x, y)) {
        continue;
      }
      seen[index] = 1;
      count += 1;
      if (x > 0) {
        queue.push(index - 1);
      }
      if (x < BOT_CONFIG.cols - 1) {
        queue.push(index + 1);
      }
      if (y > 0) {
        queue.push(index - BOT_CONFIG.cols);
      }
      if (y < BOT_CONFIG.rows - 1) {
        queue.push(index + BOT_CONFIG.cols);
      }
    }
    return count;
  }

  computeTerritoryControl(botStart, opponentStart, grid) {
    const total = BOT_CONFIG.cols * BOT_CONFIG.rows;
    const distance = new Int16Array(total).fill(-1);
    const owner = new Uint8Array(total);
    const queue = [];
    const botIndex = botStart.y * BOT_CONFIG.cols + botStart.x;
    const opponentIndex = opponentStart.y * BOT_CONFIG.cols + opponentStart.x;
    distance[botIndex] = 0;
    owner[botIndex] = 1;
    queue.push(botIndex);
    distance[opponentIndex] = 0;
    owner[opponentIndex] = 2;
    queue.push(opponentIndex);

    let botCount = botIndex === opponentIndex ? 0 : 1;
    let opponentCount = botIndex === opponentIndex ? 0 : 1;
    if (botIndex === opponentIndex) {
      owner[botIndex] = 3;
    }

    let head = 0;
    while (head < queue.length) {
      const index = queue[head];
      head += 1;
      const x = index % BOT_CONFIG.cols;
      const y = Math.floor(index / BOT_CONFIG.cols);
      const currentOwner = owner[index];
      if (currentOwner === 3) {
        continue;
      }

      for (const direction of Object.values(BOT_DIRECTIONS)) {
        const nextX = x + direction.x;
        const nextY = y + direction.y;
        if (!this.isInside(nextX, nextY) || grid[nextY][nextX] !== 0) {
          continue;
        }
        const nextIndex = nextY * BOT_CONFIG.cols + nextX;
        if (distance[nextIndex] === -1) {
          distance[nextIndex] = distance[index] + 1;
          owner[nextIndex] = currentOwner;
          if (currentOwner === 1) {
            botCount += 1;
          } else {
            opponentCount += 1;
          }
          queue.push(nextIndex);
        } else if (distance[nextIndex] === distance[index] + 1 && owner[nextIndex] !== currentOwner && owner[nextIndex] !== 3) {
          if (owner[nextIndex] === 1) {
            botCount -= 1;
          } else {
            opponentCount -= 1;
          }
          owner[nextIndex] = 3;
        }
      }
    }

    return botCount - opponentCount;
  }

  countSafeTurns(position, direction, grid) {
    return this.getCandidateDirections(direction)
      .map((candidateDirection) => {
        const vector = BOT_DIRECTIONS[candidateDirection];
        return {
          x: position.x + vector.x,
          y: position.y + vector.y
        };
      })
      .filter((move) => !this.isCollisionOnGrid(grid, move.x, move.y))
      .length;
  }

  measureEscapePotential(position, direction, grid) {
    const nextMoves = this.getCandidateDirections(direction)
      .map((candidateDirection) => {
        const vector = BOT_DIRECTIONS[candidateDirection];
        return {
          direction: candidateDirection,
          next: {
            x: position.x + vector.x,
            y: position.y + vector.y
          }
        };
      })
      .filter((candidate) => !this.isCollisionOnGrid(grid, candidate.next.x, candidate.next.y));

    if (nextMoves.length === 0) {
      return -10;
    }

    let bestFutureSpace = 0;
    let totalFutureSpace = 0;
    for (const move of nextMoves) {
      const futureGrid = grid.map((row) => row.slice());
      futureGrid[move.next.y][move.next.x] = 2;
      const space = this.floodFillOnGrid(move.next.x, move.next.y, futureGrid);
      bestFutureSpace = Math.max(bestFutureSpace, space);
      totalFutureSpace += space;
    }
    return nextMoves.length * 3 + bestFutureSpace * 0.08 + (totalFutureSpace / nextMoves.length) * 0.03;
  }

  measureCorridorRisk(position, grid) {
    const seen = new Set();
    const queue = [{ x: position.x, y: position.y, depth: 0 }];
    let risk = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      const key = `${current.x},${current.y}`;
      if (seen.has(key) || current.depth > 12) {
        continue;
      }
      seen.add(key);

      const exits = Object.values(BOT_DIRECTIONS)
        .map((direction) => ({
          x: current.x + direction.x,
          y: current.y + direction.y
        }))
        .filter((next) => !this.isCollisionOnGrid(grid, next.x, next.y))
        .length;
      if (exits <= 1) {
        risk += 4;
      } else if (exits === 2) {
        risk += 1;
      }

      for (const direction of Object.values(BOT_DIRECTIONS)) {
        const next = {
          x: current.x + direction.x,
          y: current.y + direction.y,
          depth: current.depth + 1
        };
        const nextKey = `${next.x},${next.y}`;
        if (!seen.has(nextKey) && !this.isCollisionOnGrid(grid, next.x, next.y)) {
          queue.push(next);
        }
      }
    }
    return risk;
  }

  projectedSafety(startPosition, startDirection, grid, steps) {
    let position = startPosition;
    let direction = startDirection;
    const projectedGrid = grid.map((row) => row.slice());
    let minSafety = this.floodFillOnGrid(position.x, position.y, projectedGrid);

    for (let i = 0; i < steps; i += 1) {
      const moves = this.getSafeMoves({ x: position.x, y: position.y, direction }, projectedGrid);
      if (moves.length === 0) {
        return 0;
      }
      let bestMove = moves[0];
      let bestSpace = -1;
      for (const move of moves) {
        const space = this.floodFillOnGrid(move.next.x, move.next.y, projectedGrid);
        if (space > bestSpace) {
          bestSpace = space;
          bestMove = move;
        }
      }
      projectedGrid[bestMove.next.y][bestMove.next.x] = 2;
      minSafety = Math.min(minSafety, bestSpace);
      position = bestMove.next;
      direction = bestMove.direction;
    }
    return minSafety;
  }

  countEmptyCells(grid) {
    let count = 0;
    for (let y = 0; y < BOT_CONFIG.rows; y += 1) {
      for (let x = 0; x < BOT_CONFIG.cols; x += 1) {
        if (grid[y][x] === 0) {
          count += 1;
        }
      }
    }
    return count;
  }

  countOwnTrailNeighbors(position, grid) {
    return Object.values(BOT_DIRECTIONS)
      .map((direction) => ({
        x: position.x + direction.x,
        y: position.y + direction.y
      }))
      .filter((neighbor) => this.isInside(neighbor.x, neighbor.y) && grid[neighbor.y][neighbor.x] === 2)
      .length;
  }

  computeCenterBias(position) {
    const centerX = (BOT_CONFIG.cols - 1) / 2;
    const centerY = (BOT_CONFIG.rows - 1) / 2;
    const distance = Math.abs(position.x - centerX) + Math.abs(position.y - centerY);
    return -(distance / (BOT_CONFIG.cols + BOT_CONFIG.rows));
  }

  computeCenterControl(botPosition, opponentPosition) {
    return this.computeCenterBias(botPosition) - this.computeCenterBias(opponentPosition);
  }
}

function chooseBotDirection() {
  const botGameState = makeBotGameState();
  const botBrain = new TronBotBrain(botGameState);
  return botVectorFromDirectionName(botBrain.getMove(botDifficulty));
}

function stepSimulation() {
  if (opponentMode === "bot") {
    const botDirection = chooseBotDirection();
    if (!players[1].pendingDirection.equals(botDirection)) {
      appendLog(`tick ${movementTick + 1}: P2 bot chose ${directionName(botDirection)} from ${formatGrid(players[1].position)}`, "key");
      playBotPulse();
    }
    players[1].pendingDirection.copy(botDirection);
  }

  if (hasDangerAhead(players[0]) || (opponentMode === "human" && hasDangerAhead(players[1]))) {
    playDangerPulse();
  }

  movementTick += 1;
  const moves = players.map((player) => {
    player.direction.copy(player.pendingDirection);
    return {
      player,
      from: cloneGrid(player.position),
      to: addGrid(player.position, player.direction)
    };
  });

  const destinationCounts = new Map();
  moves.forEach(({ to }) => {
    const key = positionKey(to);
    destinationCounts.set(key, (destinationCounts.get(key) || 0) + 1);
  });

  const crashed = new Set();
  moves.forEach(({ player, to }) => {
    const key = positionKey(to);
    if (!inBounds(to) || occupied.has(key) || destinationCounts.get(key) > 1) {
      crashed.add(player.id);
    }
  });

  moves.forEach(({ player, from, to }) => {
    if (!crashed.has(player.id)) {
      player.position = to;
      const key = positionKey(to);
      occupied.add(key);
      trailCells.set(key, player.id);
      createTrailSegment(player, from, to);
      appendLog(`tick ${movementTick}: ${player.id.toUpperCase()} moved ${directionName(player.direction)} ${formatGrid(from)} -> ${formatGrid(to)}`, "move");
    } else {
      appendLog(`tick ${movementTick}: ${player.id.toUpperCase()} tried ${directionName(player.direction)} ${formatGrid(from)} -> ${formatGrid(to)} and crashed`, "crash");
    }
  });
  if (crashed.size === 0) {
    playMovePulse();
  }

  players.forEach((player) => {
    if (crashed.has(player.id)) {
      player.alive = false;
    }
    player.mesh.visible = player.alive;
  });

  if (crashed.size > 0) {
    endRound(crashed);
  }
}

function endRound(crashed) {
  running = false;
  setPhase("ended");
  sounds.engine.pause();
  playSound("crash");
  roundStateEl.textContent = "CRASH";

  let title = "DRAW";
  let className = "result-red";
  if (crashed.size === 1 && crashed.has("p1")) {
    scores.p2 += 1;
    title = opponentMode === "bot" ? "BOT WINS" : "PLAYER 2 WINS";
    className = "result-orange";
    setTimeout(() => playSound("win"), 180);
  } else if (crashed.size === 1 && crashed.has("p2")) {
    scores.p1 += 1;
    title = "PLAYER 1 WINS";
    className = "result-cyan";
    setTimeout(() => playSound("win"), 180);
  } else {
    setTimeout(() => playSound("draw"), 180);
  }
  updateScores();
  showPanel(`
    <p class="eyebrow">ROUND COMPLETE</p>
    <h1 class="${className}">${title}</h1>
    <p class="lead">Press Space to replay this mode, 1 for bot, or 2 for multiplayer.</p>
    <p class="hint">After 1: press 3 for easy bot or 4 for hard bot</p>
  `);
}

function submitGameOverScore() {
  if (submittedScore) {
    return;
  }

  submittedScore = Boolean(
    window.ArcadeHighScores?.promptAndSubmit("tron-3d", Math.max(scores.p1, scores.p2))
  );
}

function updateScores() {
  p1ScoreEl.textContent = scores.p1;
  p2ScoreEl.textContent = scores.p2;
}

function showPanel(html) {
  panel.innerHTML = html;
  overlay.classList.remove("hidden");
}

function hidePanel() {
  overlay.classList.add("hidden");
}

function showModePrompt() {
  if (gamePhase === "ended") {
    submitGameOverScore();
  }

  running = false;
  setPhase("idle");
  updateModeUi();
  roundStateEl.textContent = "IDLE";
  matchModeEl.textContent = "SELECT MODE";
  showPanel(`
    <p class="eyebrow">LIGHT CYCLE PROGRAM</p>
    <h1><span>TRON</span> 3D</h1>
    <p class="lead">Press 1 for bot mode, 2 for multiplayer.</p>
    <p class="hint">After 1: press 3 for easy bot or 4 for hard bot</p>
  `);
}

function showBotPrompt() {
  if (gamePhase === "ended") {
    submitGameOverScore();
  }

  running = false;
  opponentMode = "bot";
  setPhase("bot-select");
  updateModeUi();
  roundStateEl.textContent = "BOT";
  matchModeEl.textContent = "SELECT BOT";
  playSound("menu");
  appendLog("bot mode selected: waiting for difficulty", "system");
  showPanel(`
    <p class="eyebrow">BOT PROGRAM</p>
    <h1><span>BOT</span> MODE</h1>
    <p class="lead">Press 3 for easy bot, or 4 for hard bot.</p>
    <p class="hint">P1: WASD or arrows. The bot controls orange.</p>
  `);
}

function startBotRound(difficulty) {
  opponentMode = "bot";
  botDifficulty = difficulty;
  startSelectedRound();
}

function startMultiplayerRound() {
  opponentMode = "human";
  startSelectedRound();
}

function restartCurrentRound() {
  if (opponentMode === "bot") {
    startBotRound(botDifficulty);
    return;
  }
  startMultiplayerRound();
}

function startSelectedRound() {
  if (gamePhase === "ended") {
    submitGameOverScore();
  }

  playSound("menu");
  updateModeUi();
  matchModeEl.textContent = opponentMode === "bot" ? `BOT ${botDifficulty.toUpperCase()}` : "HUMAN DUEL";
  appendLog(`round selected: ${opponentMode === "bot" ? `bot ${botDifficulty}` : "P2 human"}`, "system");
  startCountdown();
}

function startCountdown() {
  setPhase("countdown");
  resetRound();
  submittedScore = false;
  appendLog("countdown started", "system");
  const sequence = ["3", "2", "1", "GO"];
  let index = 0;
  roundStateEl.textContent = "COUNTDOWN";

  const showNext = () => {
    const value = sequence[index];
    showPanel(`
      <p class="eyebrow">SYSTEM READY</p>
      <h1>${value}</h1>
    `);
    playSound(value === "GO" ? "start" : "countdown");
    index += 1;
    if (index < sequence.length) {
      setTimeout(showNext, value === "GO" ? 460 : 720);
    } else {
      setTimeout(beginRound, 460);
    }
  };
  showNext();
}

function beginRound() {
  hidePanel();
  running = true;
  setPhase("playing");
  lastTick = performance.now();
  accumulator = 0;
  riderCameraTargets.forEach((target) => {
    target.position.set(0, 0, 0);
    target.lookAt.set(0, 0, 0);
  });
  roundStateEl.textContent = "LIVE";
  appendLog("round live: movement logging active", "system");
  sounds.engine.currentTime = 0;
  sounds.engine.play().catch(() => {});
}

function updateOverviewCamera() {
  const p1 = players?.[0]?.mesh.position || new THREE.Vector3();
  const p2 = players?.[1]?.mesh.position || new THREE.Vector3();
  const center = p1.clone().add(p2).multiplyScalar(0.5);
  const offset = new THREE.Vector3(42, 38, 52);
  const targetPosition = center.clone().add(offset);
  overviewCamera.position.lerp(targetPosition, 0.075);
  overviewCamera.lookAt(center);
}

function updateRiderCamera(player, camera) {
  const index = player.id === "p1" ? 0 : 1;
  const cameraTarget = riderCameraTargets[index];
  const forward = player.renderDirection.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const position = player.renderPosition.clone();
  const desiredEye = position.clone()
    .add(forward.clone().multiplyScalar(-CHASE_DISTANCE))
    .add(up.clone().multiplyScalar(CHASE_HEIGHT));
  const desiredLookAt = position.clone()
    .add(forward.clone().multiplyScalar(CHASE_LOOK_AHEAD))
    .add(up.clone().multiplyScalar(CHASE_LOOK_HEIGHT));

  if (cameraTarget.position.lengthSq() === 0) {
    cameraTarget.position.copy(desiredEye);
    cameraTarget.lookAt.copy(desiredLookAt);
  } else {
    cameraTarget.position.lerp(desiredEye, 0.18);
    cameraTarget.lookAt.lerp(desiredLookAt, 0.2);
  }

  camera.position.copy(cameraTarget.position);
  camera.up.copy(up);
  camera.lookAt(cameraTarget.lookAt);
}

function renderViewport(camera, x, y, width, height) {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  renderer.render(scene, camera);
}

function renderScene() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setScissorTest(true);
  renderer.clear(true, true, true);

  if (gamePhase === "playing" || gamePhase === "ended") {
    updateRiderCamera(players[0], riderCameras[0]);
    if (opponentMode === "bot") {
      renderViewport(riderCameras[0], 0, 0, width, height);
    } else {
      const leftWidth = Math.floor(width / 2);
      const rightWidth = width - leftWidth;
      updateRiderCamera(players[1], riderCameras[1]);
      renderViewport(riderCameras[0], 0, 0, leftWidth, height);
      renderViewport(riderCameras[1], leftWidth, 0, rightWidth, height);
    }
  } else {
    updateOverviewCamera();
    renderViewport(overviewCamera, 0, 0, width, height);
  }

  renderer.setScissorTest(false);
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = now - lastTick;
  lastTick = now;

  if (running) {
    accumulator += delta;
    while (accumulator >= TICK_MS) {
      stepSimulation();
      accumulator -= TICK_MS;
      if (!running) {
        break;
      }
    }
  }

  updateCycleVisuals();
  updatePlanningMarkers();
  drawMinimap();
  renderScene();
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeMinimap();
}

window.addEventListener("resize", onResize);
window.addEventListener("keydown", (event) => {
  unlockAudio();
  const rawKey = event.key === " " ? "Space" : event.key;
  appendLog(`key pressed: key="${rawKey}" code="${event.code}" repeat=${event.repeat} phase=${gamePhase}`, "key");

  if (event.code === "Digit1" || event.code === "Numpad1") {
    event.preventDefault();
    if (!running) {
      showBotPrompt();
      return;
    }
    appendLog("key action: 1 ignored during live round", "reject");
    return;
  }

  if (event.code === "Digit2" || event.code === "Numpad2") {
    event.preventDefault();
    if (!running) {
      startMultiplayerRound();
      return;
    }
    appendLog("key action: 2 ignored during live round", "reject");
    return;
  }

  if (event.code === "Digit3" || event.code === "Numpad3") {
    event.preventDefault();
    if (!running && gamePhase === "bot-select") {
      startBotRound("easy");
      return;
    }
    appendLog("key action: 3 requires bot mode selection first", "reject");
    return;
  }

  if (event.code === "Digit4" || event.code === "Numpad4") {
    event.preventDefault();
    if (!running && gamePhase === "bot-select") {
      startBotRound("hard");
      return;
    }
    appendLog("key action: 4 requires bot mode selection first", "reject");
    return;
  }

  if (event.code === "Space") {
    if (gamePhase === "ended") {
      event.preventDefault();
      appendLog("key action: Space accepted for restart", "key");
      restartCurrentRound();
    } else {
      appendLog(`key action: Space ignored during ${gamePhase}`, "reject");
    }
    return;
  }

  if (event.code === "KeyL" && event.shiftKey && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    downloadDevLog();
    appendLog("dev log downloaded with keyboard shortcut", "system");
    return;
  }

  const mapped = controlFromKey(event);
  if (!mapped) {
    appendLog(`key action: "${rawKey}" has no movement mapping`, "reject");
    return;
  }
  if (opponentMode === "bot" && mapped.playerIndex === 1) {
    event.preventDefault();
    appendLog(`key action: ${rawKey} maps to P2 ${mapped.control} but P2 is bot-controlled`, "reject");
    return;
  }
  event.preventDefault();
  const player = players[mapped.playerIndex];
  const direction = directionForControl(player, mapped.control);
  const result = setDirection(player, direction);
  appendLog(`key action: ${player.id.toUpperCase()} ${mapped.control} -> ${directionName(direction)} ${result.accepted ? "accepted" : "rejected"} (${result.reason})`, result.accepted ? "key" : "reject");
});

createArena();
resetRound();
createPlanningMarkers();
updateModeUi();
updateScores();
updateOverviewCamera();
showModePrompt();
window.TronDevLog = {
  clear: clearEventLog,
  download: downloadDevLog,
  lines: devLogLines,
  save: chooseDevLogFile,
  text: devLogText
};
appendLog("logger ready: real keydown events and simulation moves will be recorded", "system");
requestAnimationFrame(animate);
