import * as THREE from "three";
import type { ControllerState, Pose } from "../types";

export interface RenderSurface {
  id: string;
  width: number;
  height: number;
  rgba: Uint8Array;
  revision: number;
  visible?: boolean;
}

/** Pointer coordinates use the same top-left origin as surface RGBA rows. */
export interface SurfacePointerInput {
  type: "pointer";
  surfaceId: string;
  phase: "down" | "move" | "up" | "cancel";
  x: number;
  y: number;
  button: number;
}

export interface RenderSnapshot {
  headPose: Pose;
  controllers: Record<"left" | "right", ControllerState>;
  sessionState: string;
  applicationFrame?: { surfaces: RenderSurface[] };
}

interface SurfaceView {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.DataTexture;
  width: number;
  height: number;
  revision: number;
}

/** Device visualization only: application pixels are supplied by an adapter. */
export class FrameulatorRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(54, 1, 0.01, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly head = new THREE.Group();
  private readonly controllers = { left: new THREE.Group(), right: new THREE.Group() };
  private readonly observer = new ResizeObserver(() => this.resize());
  private readonly surfaceViews = new Map<string, SurfaceView>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly eyeCamera = new THREE.PerspectiveCamera(72, 180 / 132, 0.01, 30);
  private readonly eyeTargets = [
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true }),
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true }),
  ] as const;
  private readonly eyePixels = [new Uint8Array(180 * 132 * 4), new Uint8Array(180 * 132 * 4)] as const;
  private previews?: [HTMLCanvasElement, HTMLCanvasElement];
  private inputHandler?: (input: SurfacePointerInput) => void;
  private capturedPointer?: { pointerId: number; input: SurfacePointerInput };
  private animationFrame = 0;
  private destroyed = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x080e13, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-label", "Simulated headset, controllers and application surfaces");
    this.renderer.domElement.style.touchAction = "none";
    this.container.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointer);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointer);
    this.renderer.domElement.addEventListener("pointerup", this.handlePointer);
    this.renderer.domElement.addEventListener("pointercancel", this.handlePointer);
    this.renderer.domElement.addEventListener("lostpointercapture", this.handleLostCapture);

    this.camera.position.set(2.7, 2.15, 4.2);
    this.camera.lookAt(0, 1.1, -0.65);
    this.scene.fog = new THREE.FogExp2(0x080e13, 0.055);
    this.scene.add(new THREE.HemisphereLight(0xd4e8ff, 0x152126, 2.4));
    const key = new THREE.DirectionalLight(0xadc9ff, 4);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x0d171e, roughness: 0.82, metalness: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(14, 28, 0x31525e, 0x18323d);
    grid.material.opacity = 0.55;
    grid.material.transparent = true;
    this.scene.add(grid);
    this.buildHeadset();
    this.buildController(this.controllers.left, 0x78dac5);
    this.buildController(this.controllers.right, 0xf1be83);
    this.head.position.set(0, 1.65, 0);
    this.controllers.left.position.set(-0.36, 1.13, 0.14);
    this.controllers.right.position.set(0.36, 1.13, 0.14);
    this.scene.add(this.head, this.controllers.left, this.controllers.right);
    this.observer.observe(container);
    this.resize();
    this.animate();
  }

  setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void {
    this.previews = [left, right];
  }

  setInputHandler(handler?: (input: SurfacePointerInput) => void): void {
    this.inputHandler = handler;
  }

  update(snapshot: RenderSnapshot): void {
    this.applyPose(this.head, snapshot.headPose);
    this.applyController(this.controllers.left, snapshot.controllers.left);
    this.applyController(this.controllers.right, snapshot.controllers.right);
    this.updateSurfaces(snapshot.applicationFrame?.surfaces ?? []);
  }

  clearApplicationFrame(): void {
    this.cancelPointer();
    for (const view of this.surfaceViews.values()) this.disposeSurface(view);
    this.surfaceViews.clear();
    for (const canvas of this.previews ?? []) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.clearApplicationFrame();
    this.inputHandler = undefined;
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      this.renderer.domElement.removeEventListener(type, this.handlePointer as EventListener);
    }
    this.renderer.domElement.removeEventListener("lostpointercapture", this.handleLostCapture);
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((item) => item.dispose());
      else mesh.material?.dispose();
    });
    this.eyeTargets.forEach((target) => target.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private updateSurfaces(surfaces: RenderSurface[]): void {
    const visible = surfaces.filter((surface) => surface.visible !== false);
    const ids = new Set(visible.map((surface) => surface.id));
    if (this.capturedPointer && !ids.has(this.capturedPointer.input.surfaceId)) this.cancelPointer();
    for (const [id, view] of this.surfaceViews) {
      if (!ids.has(id)) { this.disposeSurface(view); this.surfaceViews.delete(id); }
    }
    visible.forEach((surface, index) => {
      let view = this.surfaceViews.get(surface.id);
      if (view && (view.width !== surface.width || view.height !== surface.height)) {
        this.disposeSurface(view);
        this.surfaceViews.delete(surface.id);
        view = undefined;
      }
      if (!view) {
        const texture = new THREE.DataTexture(new Uint8Array(surface.rgba), surface.width, surface.height, THREE.RGBAFormat);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = true;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, toneMapped: false }),
        );
        mesh.userData.surfaceId = surface.id;
        this.scene.add(mesh);
        view = { mesh, texture, width: surface.width, height: surface.height, revision: surface.revision };
        this.surfaceViews.set(surface.id, view);
      } else if (view.revision !== surface.revision) {
        (view.texture.image.data as Uint8Array).set(surface.rgba);
        view.texture.needsUpdate = true;
        view.revision = surface.revision;
      }
      const aspect = surface.width / surface.height;
      const width = Math.min(2.2, 1.45 * aspect);
      const height = width / aspect;
      // Multiple surfaces remain distinct instead of silently compositing over one another.
      view.mesh.scale.set(width, height, 1);
      view.mesh.position.set((index - (visible.length - 1) / 2) * 2.4, 1.5, -1.65);
    });
  }

  private disposeSurface(view: SurfaceView): void {
    this.scene.remove(view.mesh);
    view.texture.dispose();
    view.mesh.geometry.dispose();
    view.mesh.material.dispose();
  }

  private handlePointer = (event: PointerEvent): void => {
    if (!this.inputHandler || (this.capturedPointer && event.pointerId !== this.capturedPointer.pointerId)) return;
    const phase = ({ pointerdown: "down", pointermove: "move", pointerup: "up", pointercancel: "cancel" } as const)[event.type as "pointerdown" | "pointermove" | "pointerup" | "pointercancel"];
    if (phase === "cancel") { this.cancelPointer(); return; }
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (phase === "up" && this.capturedPointer && (event.clientX < bounds.left || event.clientX > bounds.left + bounds.width || event.clientY < bounds.top || event.clientY > bounds.top + bounds.height)) {
      this.cancelPointer();
      return;
    }
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    ), this.camera);
    const target = this.capturedPointer?.input.surfaceId;
    const meshes = Array.from(this.surfaceViews.entries()).filter(([id]) => !target || id === target).map(([, view]) => view.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    const previous = this.capturedPointer?.input;
    if (!hit?.uv) {
      // Releasing off the captured surface must never activate the last hit.
      if (phase === "up" && previous) this.cancelPointer();
      return;
    }
    // PointerEvent.button is -1 for ordinary moves; keep the pressed button
    // during a drag and use primary-button identity for an uncaptured hover.
    const button = phase === "move" ? previous?.button ?? 0 : event.button;
    const input: SurfacePointerInput = {
      type: "pointer", surfaceId: String(hit.object.userData.surfaceId), phase,
      x: Math.max(0, Math.min(1, hit.uv.x)), y: Math.max(0, Math.min(1, 1 - hit.uv.y)), button,
    };
    if (phase === "down") {
      event.preventDefault();
      this.capturedPointer = { pointerId: event.pointerId, input };
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } else if (this.capturedPointer) this.capturedPointer.input = input;
    this.inputHandler(input);
    if (phase === "up") {
      this.capturedPointer = undefined;
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  private handleLostCapture = (): void => { this.cancelPointer(); };

  private cancelPointer(): void {
    const pointer = this.capturedPointer;
    if (!pointer) return;
    this.capturedPointer = undefined;
    this.inputHandler?.({ ...pointer.input, phase: "cancel" });
    if (this.renderer.domElement.hasPointerCapture(pointer.pointerId)) this.renderer.domElement.releasePointerCapture(pointer.pointerId);
  }

  private buildHeadset(): void {
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.25, 0.2, 3, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0xe7eeec, roughness: 0.28, metalness: 0.45 }),
    );
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.15, 0.025),
      new THREE.MeshPhysicalMaterial({ color: 0x071a1e, emissive: 0x0c6768, emissiveIntensity: 0.6, roughness: 0.08 }),
    );
    visor.position.z = 0.112;
    this.head.add(shell, visor);
  }

  private buildController(group: THREE.Group, color: number): void {
    const grip = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.18, 5, 12),
      new THREE.MeshStandardMaterial({ color: 0xdce6e4, roughness: 0.32, metalness: 0.45 }),
    );
    grip.rotation.x = Math.PI / 7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 36), new THREE.MeshBasicMaterial({ color }));
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
    object.scale.setScalar(1 + Math.max(0, Math.min(1, state.trigger ?? 0)) * 0.12);
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
    this.renderer.render(this.scene, this.camera);
    this.copyPreviews();
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private copyPreviews(): void {
    if (!this.previews) return;
    for (const [index, canvas] of this.previews.entries()) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const width = 180;
      const height = 132;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      this.eyeCamera.position.set(index === 0 ? -0.032 : 0.032, 1.65, 0.05);
      this.eyeCamera.lookAt(0, 1.5, -1.65);
      // Hide the visual headset model when viewing from inside it.
      this.head.visible = false;
      this.renderer.setRenderTarget(this.eyeTargets[index]);
      this.renderer.render(this.scene, this.eyeCamera);
      this.renderer.readRenderTargetPixels(this.eyeTargets[index], 0, 0, width, height, this.eyePixels[index]);
      this.renderer.setRenderTarget(null);
      this.head.visible = true;
      const pixels = context.createImageData(width, height);
      for (let row = 0; row < height; row += 1) {
        const offset = (height - row - 1) * width * 4;
        pixels.data.set(this.eyePixels[index].subarray(offset, offset + width * 4), row * width * 4);
      }
      context.putImageData(pixels, 0, 0);
    }
  }
}
