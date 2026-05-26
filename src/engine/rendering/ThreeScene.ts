import * as THREE from "three";

export interface ThreeSceneOptions {
  canvas: HTMLCanvasElement;
  fov?: number;
  near?: number;
  far?: number;
  background?: THREE.ColorRepresentation;
}

export class ThreeScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly raycaster = new THREE.Raycaster();

  constructor(options: ThreeSceneOptions) {
    this.camera = new THREE.PerspectiveCamera(options.fov ?? 70, options.canvas.width / options.canvas.height, options.near ?? 0.1, options.far ?? 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true });
    this.renderer.setSize(options.canvas.width, options.canvas.height, false);
    this.scene.background = new THREE.Color(options.background ?? "#101318");
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  raycastFromCamera(x: number, y: number, objects: THREE.Object3D[]): THREE.Intersection[] {
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
