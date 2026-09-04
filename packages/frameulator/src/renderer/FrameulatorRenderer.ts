import * as THREE from "three";
import type { ControllerState, Pose } from "../types";
import type { CapsuleSnapshot } from "../application/BrowserCapsule";

export interface RenderSnapshot {
  headPose: Pose;
  controllers: Record<"left" | "right", ControllerState>;
  sessionState: string;
  applicationFrame?: CapsuleSnapshot;
}

export class FrameulatorRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(54, 1, 0.01, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly head = new THREE.Group();
  private readonly controllers = {
    left: new THREE.Group(),
    right: new THREE.Group(),
  };
  private readonly observer = new ResizeObserver(() => this.resize());
  private readonly applicationCube: THREE.Mesh;
  private readonly applicationHalo: THREE.Mesh;
  private readonly eyeCamera = new THREE.PerspectiveCamera(72, 180 / 132, 0.01, 30);
  private readonly eyeTargets = [
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true }),
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true }),
  ] as const;
  private readonly eyePixels = [new Uint8Array(180 * 132 * 4), new Uint8Array(180 * 132 * 4)] as const;
  private previews?: [HTMLCanvasElement, HTMLCanvasElement];
  private animationFrame = 0;
  private destroyed = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x050708, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-label", "Simulated Steam Frame environment");
    this.container.append(this.renderer.domElement);

    this.camera.position.set(2.8, 2.1, 4.4);
    this.camera.lookAt(0, 1.2, 0);
    this.scene.fog = new THREE.FogExp2(0x050708, 0.085);
    this.scene.add(new THREE.HemisphereLight(0xb9e6ff, 0x160d21, 2.4));
    const key = new THREE.DirectionalLight(0xff7b42, 5);
    key.position.set(2, 4, 3);
    this.scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x0b1114, roughness: 0.82, metalness: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(14, 28, 0x1a6f73, 0x123538);
    grid.material.opacity = 0.48;
    grid.material.transparent = true;
    this.scene.add(grid);

    this.buildHeadset();
    this.buildController(this.controllers.left, 0x5de0d2);
    this.buildController(this.controllers.right, 0xff7548);
    this.scene.add(this.head, this.controllers.left, this.controllers.right);

    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0x37cbbb, transparent: true, opacity: 0.65 }),
    );
    portal.position.set(0, 1.45, -1.4);
    this.scene.add(portal);

    this.applicationCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.48, 0.48),
      new THREE.MeshStandardMaterial({ color: 0x69e2d0, emissive: 0x0d6e68, emissiveIntensity: 0.55, roughness: 0.24, metalness: 0.36 }),
    );
    this.applicationCube.position.set(0, 1.45, -1.48);
    this.applicationCube.visible = false;
    this.applicationHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.47, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff7548, transparent: true, opacity: 0.72 }),
    );
    this.applicationHalo.position.copy(this.applicationCube.position);
    this.applicationHalo.visible = false;
    this.scene.add(this.applicationCube, this.applicationHalo);

    this.observer.observe(container);
    this.resize();
    this.animate();
  }

  setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void {
    this.previews = [left, right];
  }

  update(snapshot: RenderSnapshot): void {
    this.applyPose(this.head, snapshot.headPose);
    this.applyController(this.controllers.left, snapshot.controllers.left);
    this.applyController(this.controllers.right, snapshot.controllers.right);
    if (snapshot.applicationFrame) {
      this.applicationCube.visible = true;
      this.applicationHalo.visible = true;
      const phase = snapshot.applicationFrame.scenePhaseRadians;
      this.applicationCube.rotation.set(phase * 0.62, phase, phase * 0.28);
      this.applicationHalo.rotation.y = -phase * 0.45;
    }
  }

  clearApplicationFrame(): void {
    this.applicationCube.visible = false;
    this.applicationHalo.visible = false;
    for (const canvas of this.previews ?? []) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose();
    });
    this.renderer.dispose();
    this.eyeTargets.forEach((target) => target.dispose());
    this.renderer.domElement.remove();
  }

  private buildHeadset(): void {
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.25, 0.2, 3, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0xe7eeec, roughness: 0.28, metalness: 0.45 }),
    );
    shell.position.y = 1.65;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.15, 0.025),
      new THREE.MeshPhysicalMaterial({ color: 0x071a1e, emissive: 0x0c6768, emissiveIntensity: 0.6, roughness: 0.08 }),
    );
    visor.position.set(0, 1.65, 0.112);
    this.head.add(shell, visor);
  }

  private buildController(group: THREE.Group, color: number): void {
    const grip = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.18, 5, 12),
      new THREE.MeshStandardMaterial({ color: 0xdce6e4, roughness: 0.32, metalness: 0.45 }),
    );
    grip.rotation.x = Math.PI / 7;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.012, 8, 36),
      new THREE.MeshBasicMaterial({ color }),
    );
    ring.position.y = 0.14;
    ring.rotation.x = Math.PI / 2;
    group.add(grip, ring);
  }

  private applyPose(object: THREE.Object3D, pose: Pose): void {
    object.position.fromArray(pose.position);
    object.quaternion.fromArray(pose.orientation);
  }

  private applyController(object: THREE.Object3D, state: ControllerState): void {
    if (state.pose) this.applyPose(object, state.pose);
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = (): void => {
    if (this.destroyed) return;
    const seconds = performance.now() / 1000;
    this.scene.rotation.y = Math.sin(seconds * 0.18) * 0.035;
    this.renderer.render(this.scene, this.camera);
    this.copyPreviews();
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private copyPreviews(): void {
    if (!this.previews) return;
    for (const [index, canvas] of this.previews.entries()) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const width = canvas.width;
      const height = canvas.height;
      this.eyeCamera.position.set(index === 0 ? -0.032 : 0.032, 1.65, 0.05);
      this.eyeCamera.lookAt(0, 1.45, -1.5);
      this.renderer.setRenderTarget(this.eyeTargets[index]);
      this.renderer.render(this.scene, this.eyeCamera);
      this.renderer.readRenderTargetPixels(this.eyeTargets[index], 0, 0, width, height, this.eyePixels[index]);
      this.renderer.setRenderTarget(null);
      const image = context.createImageData(width, height);
      for (let row = 0; row < height; row += 1) {
        const sourceStart = (height - row - 1) * width * 4;
        image.data.set(this.eyePixels[index].subarray(sourceStart, sourceStart + width * 4), row * width * 4);
      }
      context.putImageData(image, 0, 0);
      context.fillStyle = "rgba(6, 10, 11, 0.72)";
      context.fillRect(8, 8, 42, 18);
      context.fillStyle = "#bff9ee";
      context.font = "600 10px ui-monospace, monospace";
      context.fillText(index === 0 ? "LEFT" : "RIGHT", 13, 21);
    }
  }
}
