import "../../shared/page.css";
import * as THREE from "three";
import { InputManager, ThreeScene } from "../../../src/engine";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) {
  throw new Error("Missing #game canvas.");
}

const input = new InputManager(canvas);
const world = new ThreeScene({ canvas, background: "#101318" });
world.camera.position.set(0, 1.6, 5);

const light = new THREE.DirectionalLight("#ffffff", 2);
light.position.set(3, 5, 4);
world.scene.add(light);
world.scene.add(new THREE.AmbientLight("#8aa0b8", 0.7));

const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 8), new THREE.MeshStandardMaterial({ color: "#293241" }));
floor.position.y = -0.05;
world.scene.add(floor);

const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#30c5ff" }));
cube.position.y = 0.6;
world.scene.add(cube);

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  cube.rotation.x += dt * 0.8;
  cube.rotation.y += dt * 1.2;

  const speed = 4 * dt;
  if (input.isKeyDown("KeyW")) world.camera.position.z -= speed;
  if (input.isKeyDown("KeyS")) world.camera.position.z += speed;
  if (input.isKeyDown("KeyA")) world.camera.position.x -= speed;
  if (input.isKeyDown("KeyD")) world.camera.position.x += speed;

  world.render();
  input.endFrame();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
