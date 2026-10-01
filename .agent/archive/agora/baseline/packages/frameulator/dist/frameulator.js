/* Frameulator 0.2.0 | MIT */

// packages/frameulator/src/profile.ts
var SteamFrameProfile = Object.freeze({
  id: "steam-frame",
  label: "Steam Frame browser contract",
  version: "0.2.0",
  simulated: true,
  evidenceLevel: "F1-browser-wasm",
  display: {
    eyeWidth: 1440,
    eyeHeight: 1440,
    refreshRatesHz: [72, 90, 120],
    defaultRefreshRateHz: 72
  },
  hardware: {
    architecture: "aarch64",
    memoryMiB: 16384
  },
  gpu: {
    vendor: "Qualcomm",
    family: "Adreno",
    driver: "simulated-contract",
    api: "Vulkan 1.3 contract"
  },
  openxr: {
    apiVersion: "1.1",
    runtime: "SteamVR contract model",
    viewConfiguration: "PRIMARY_STEREO"
  }
});
function resolveProfile(profile) {
  if (profile === void 0 || profile === "steam-frame") return SteamFrameProfile;
  if (!profile.simulated || profile.evidenceLevel !== "F1-browser-wasm") {
    throw new Error("Browser profiles must be explicitly labeled simulated at F1-browser-wasm.");
  }
  return profile;
}

// packages/frameulator/src/scenario.ts
var DefaultScenarios = Object.freeze([
  {
    id: "normal-session",
    label: "Normal OpenXR session",
    steps: [
      { action: "start" },
      { action: "step", milliseconds: 13.888 },
      { action: "step", milliseconds: 13.888 },
      { action: "step", milliseconds: 13.888 },
      { action: "assert-state", state: "FOCUSED" }
    ]
  },
  {
    id: "tracking-recovery",
    label: "Tracking loss and recovery",
    steps: [
      { action: "start" },
      { action: "step", milliseconds: 13.888 },
      { action: "event", event: "tracking-lost" },
      { action: "assert-state", state: "LOSS_PENDING" },
      { action: "event", event: "tracking-restored" },
      { action: "assert-state", state: "FOCUSED" }
    ]
  }
]);
function createScenario(id, steps, label = id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Scenario ids must use lowercase kebab-case.");
  }
  if (steps.length === 0) throw new Error("A scenario requires at least one step.");
  return { id, label, steps: structuredClone(steps) };
}
function resolveScenario(scenario) {
  if (typeof scenario !== "string") return scenario;
  const found = DefaultScenarios.find((candidate) => candidate.id === scenario);
  if (!found) throw new Error(`Unknown Frameulator scenario: ${scenario}`);
  return structuredClone(found);
}

// packages/frameulator/src/services.ts
var NeutralPose = {
  position: [0, 1.65, 0],
  orientation: [0, 0, 0, 1]
};
function createWorld() {
  return {
    headPose: structuredClone(NeutralPose),
    controllers: {
      left: { pose: { position: [-0.25, 1.25, -0.35], orientation: [0, 0, 0, 1] } },
      right: { pose: { position: [0.25, 1.25, -0.35], orientation: [0, 0, 0, 1] } }
    },
    trackingAvailable: true,
    compositorFrames: 0,
    firmwareState: "booted"
  };
}
function serviceStatuses() {
  const details = {
    hardware: "ARM64 ABI, memory and timing contract model",
    gpu: "Qualcomm/Adreno capability and budget model",
    vulkan: "Vulkan-like resource and submission validator",
    openxr: "OpenXR 1.1 session and action state machine",
    compositor: "Gamescope-like focus, pacing and frame queue model",
    firmware: "Deterministic headset firmware lifecycle model",
    tracking: "Synthetic pose, drift, prediction and loss model",
    controllers: "Virtual Steam Frame controller actions",
    host: "In-browser service and socket contract message bus"
  };
  return Object.fromEntries(
    Object.entries(details).map(([name, detail]) => [name, { name, status: "simulated", simulated: true, detail }])
  );
}
function queryService(method, profile, world) {
  switch (method) {
    case "hardware.capabilities":
      return { ...profile.hardware, littleEndian: true, simulated: true };
    case "gpu.capabilities":
      return { ...profile.gpu, maxImageDimension2D: 8192, simulated: true };
    case "vulkan.capabilities":
      return { apiVersion: "1.3", queues: ["graphics", "compute", "transfer"], nativeDriver: false, simulated: true };
    case "openxr.capabilities":
      return { ...profile.openxr, sessionStateModel: true, nativeRuntime: false, simulated: true };
    case "compositor.status":
      return { queuedFrames: 0, presentedFrames: world.compositorFrames, focused: true, simulated: true };
    case "firmware.status":
      return { state: world.firmwareState, version: "simulated-0.2.0", hardwareFirmware: false, simulated: true };
    case "tracking.status":
      return { available: world.trackingAvailable, pose: world.headPose, source: "synthetic", simulated: true };
    case "controllers.status":
      return { connected: ["left", "right"], states: world.controllers, physicalControllers: false, simulated: true };
    case "host.status":
      return { transport: "worker-message-bus", nativeSockets: false, services: 9, simulated: true };
    case "services.status":
      return serviceStatuses();
    default:
      throw new Error(`Unsupported Frameulator method: ${method}`);
  }
}

// packages/frameulator/src/wasm.ts
function decodeBase64(value) {
  if (typeof atob === "function") {
    const decoded = atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/=+$/, "");
  const output = new Uint8Array(Math.floor(clean.length * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let index = 0;
  for (const character of clean) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) continue;
    accumulator = accumulator << 6 | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = accumulator >> bits & 255;
    }
  }
  return output;
}
async function bytesFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load Frameulator WASM (${response.status}).`);
  return response.arrayBuffer();
}
async function instantiateKernel(options) {
  let source = options.wasmBytes;
  if (!source && options.wasmBase64) source = decodeBase64(options.wasmBase64);
  if (!source && options.wasmUrl) source = await bytesFromUrl(options.wasmUrl);
  if (!source) throw new Error("No Frameulator WASM source was provided.");
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const instantiated = await WebAssembly.instantiate(bytes, {});
  const instance = instantiated.instance;
  const exports = instance.exports;
  if (exports.frameulator_abi_version() !== 1) {
    throw new Error("Unsupported Frameulator WASM ABI.");
  }
  return exports;
}

// packages/frameulator/src/FrameulatorKernel.ts
var states = [
  "IDLE",
  "READY",
  "SYNCHRONIZED",
  "VISIBLE",
  "FOCUSED",
  "STOPPING",
  "LOSS_PENDING",
  "EXITING"
];
var events = {
  "tracking-lost": 1,
  "tracking-restored": 2,
  "runtime-exit": 3,
  "focus-lost": 4
};
var FrameulatorKernel = class _FrameulatorKernel {
  profile;
  wasm;
  world;
  lastReport;
  constructor(profile, wasm) {
    this.profile = profile;
    this.wasm = wasm;
    this.world = createWorld();
  }
  static async create(options = {}) {
    const embedded = true ? "" : "";
    const hasExplicitSource = Boolean(options.wasmBytes || options.wasmBase64 || options.wasmUrl);
    const wasm = await instantiateKernel({
      wasmBytes: options.wasmBytes,
      wasmBase64: options.wasmBase64 || embedded,
      wasmUrl: hasExplicitSource || embedded ? options.wasmUrl : new URL("./frameulator.wasm", import.meta.url)
    });
    wasm.frameulator_reset();
    return new _FrameulatorKernel(resolveProfile(options.profile), wasm);
  }
  get sessionState() {
    return states[this.wasm.frameulator_session_state()] ?? "IDLE";
  }
  get frameCount() {
    return Number(this.wasm.frameulator_frame_count());
  }
  get elapsedMilliseconds() {
    return Number(this.wasm.frameulator_elapsed_micros()) / 1e3;
  }
  get snapshot() {
    return {
      sessionState: this.sessionState,
      frameCount: this.frameCount,
      elapsedMilliseconds: this.elapsedMilliseconds,
      headPose: structuredClone(this.world.headPose),
      controllers: structuredClone(this.world.controllers),
      simulated: true
    };
  }
  reset() {
    this.wasm.frameulator_reset();
    this.world = createWorld();
    this.lastReport = void 0;
  }
  start() {
    this.wasm.frameulator_start();
    return this.sessionState;
  }
  stop() {
    this.wasm.frameulator_stop();
    return this.sessionState;
  }
  step(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 1e3) {
      throw new Error("Frame step must be between 0 and 1000 milliseconds.");
    }
    this.wasm.frameulator_step(Math.round(milliseconds * 1e3));
    this.world.compositorFrames += 1;
    return this.sessionState;
  }
  setHeadPose(pose) {
    this.world.headPose = structuredClone(pose);
  }
  setControllerState(hand, state) {
    this.world.controllers[hand] = { ...this.world.controllers[hand], ...structuredClone(state) };
  }
  injectEvent(event) {
    this.wasm.frameulator_inject_event(events[event]);
    if (event === "tracking-lost") this.world.trackingAvailable = false;
    if (event === "tracking-restored") this.world.trackingAvailable = true;
    return this.sessionState;
  }
  call(method) {
    return queryService(method, this.profile, this.world);
  }
  async runScenario(input) {
    const scenario = resolveScenario(input);
    const assertions = [];
    this.reset();
    for (const step of scenario.steps) {
      switch (step.action) {
        case "start":
          this.start();
          break;
        case "stop":
          this.stop();
          break;
        case "step":
          this.step(step.milliseconds);
          break;
        case "event":
          this.injectEvent(step.event);
          break;
        case "assert-state": {
          const actual = this.sessionState;
          assertions.push({ expected: step.state, actual, passed: actual === step.state });
          break;
        }
      }
    }
    this.lastReport = {
      schemaVersion: 2,
      frameulatorVersion: "0.2.0",
      scenario: scenario.id,
      profile: this.profile.id,
      simulated: true,
      evidenceLevel: "F1-browser-wasm",
      passed: assertions.length > 0 && assertions.every((assertion) => assertion.passed),
      sessionState: this.sessionState,
      frameCount: this.frameCount,
      elapsedMilliseconds: this.elapsedMilliseconds,
      assertions,
      services: serviceStatuses(),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return structuredClone(this.lastReport);
  }
  exportReport() {
    if (!this.lastReport) throw new Error("Run a scenario before exporting a report.");
    return structuredClone(this.lastReport);
  }
};

// packages/frameulator/src/renderer/FrameulatorRenderer.ts
import * as THREE from "three";
var FrameulatorRenderer = class {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(329480, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-label", "Simulated Steam Frame environment");
    this.container.append(this.renderer.domElement);
    this.camera.position.set(2.8, 2.1, 4.4);
    this.camera.lookAt(0, 1.2, 0);
    this.scene.fog = new THREE.FogExp2(329480, 0.085);
    this.scene.add(new THREE.HemisphereLight(12183295, 1445153, 2.4));
    const key = new THREE.DirectionalLight(16743234, 5);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 725268, roughness: 0.82, metalness: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(14, 28, 1732467, 1193272);
    grid.material.opacity = 0.48;
    grid.material.transparent = true;
    this.scene.add(grid);
    this.buildHeadset();
    this.buildController(this.controllers.left, 6152402);
    this.buildController(this.controllers.right, 16741704);
    this.scene.add(this.head, this.controllers.left, this.controllers.right);
    this.portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({ color: 3656635, transparent: true, opacity: 0.65 })
    );
    this.portal.position.set(0, 1.45, -1.4);
    this.scene.add(this.portal);
    this.applicationCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.48, 0.48),
      new THREE.MeshStandardMaterial({ color: 6939344, emissive: 880232, emissiveIntensity: 0.55, roughness: 0.24, metalness: 0.36 })
    );
    this.applicationCube.position.set(0, 1.45, -1.48);
    this.applicationCube.visible = false;
    this.applicationHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.47, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({ color: 16741704, transparent: true, opacity: 0.72 })
    );
    this.applicationHalo.position.copy(this.applicationCube.position);
    this.applicationHalo.visible = false;
    this.scene.add(this.applicationCube, this.applicationHalo);
    this.observer.observe(container);
    this.resize();
    this.animate();
  }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(54, 1, 0.01, 100);
  renderer;
  head = new THREE.Group();
  controllers = {
    left: new THREE.Group(),
    right: new THREE.Group()
  };
  observer = new ResizeObserver(() => this.resize());
  applicationCube;
  applicationHalo;
  portal;
  eyeCamera = new THREE.PerspectiveCamera(72, 180 / 132, 0.01, 30);
  eyeTargets = [
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true }),
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true })
  ];
  eyePixels = [new Uint8Array(180 * 132 * 4), new Uint8Array(180 * 132 * 4)];
  previews;
  animationFrame = 0;
  destroyed = false;
  setEyePreviews(left, right) {
    this.previews = [left, right];
  }
  update(snapshot) {
    this.applyPose(this.head, snapshot.headPose);
    this.applyController(this.controllers.left, snapshot.controllers.left);
    this.applyController(this.controllers.right, snapshot.controllers.right);
    if (snapshot.applicationFrame) {
      const running = snapshot.applicationFrame.management.applicationSessionState === "RUNNING";
      this.applicationCube.visible = running;
      this.applicationHalo.visible = running;
      const portalMaterial = this.portal.material;
      portalMaterial.color.setHex(snapshot.applicationFrame.trackingAvailable ? 3656635 : 16741704);
      portalMaterial.opacity = running ? 0.88 : snapshot.applicationFrame.management.deploymentState === "DEPLOYED" ? 0.55 : 0.24;
      const phase = snapshot.applicationFrame.scenePhaseRadians;
      this.applicationCube.rotation.set(phase * 0.62, phase, phase * 0.28);
      this.applicationHalo.rotation.y = -phase * 0.45;
    }
  }
  clearApplicationFrame() {
    this.applicationCube.visible = false;
    this.applicationHalo.visible = false;
    for (const canvas of this.previews ?? []) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.scene.traverse((object) => {
      const mesh = object;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose();
    });
    this.renderer.dispose();
    this.eyeTargets.forEach((target) => target.dispose());
    this.renderer.domElement.remove();
  }
  buildHeadset() {
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.25, 0.2, 3, 2, 2),
      new THREE.MeshStandardMaterial({ color: 15199980, roughness: 0.28, metalness: 0.45 })
    );
    shell.position.y = 1.65;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.15, 0.025),
      new THREE.MeshPhysicalMaterial({ color: 465438, emissive: 812904, emissiveIntensity: 0.6, roughness: 0.08 })
    );
    visor.position.set(0, 1.65, 0.112);
    this.head.add(shell, visor);
  }
  buildController(group, color) {
    const grip = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.18, 5, 12),
      new THREE.MeshStandardMaterial({ color: 14477028, roughness: 0.32, metalness: 0.45 })
    );
    grip.rotation.x = Math.PI / 7;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.012, 8, 36),
      new THREE.MeshBasicMaterial({ color })
    );
    ring.position.y = 0.14;
    ring.rotation.x = Math.PI / 2;
    group.add(grip, ring);
  }
  applyPose(object, pose) {
    object.position.fromArray(pose.position);
    object.quaternion.fromArray(pose.orientation);
  }
  applyController(object, state) {
    if (state.pose) this.applyPose(object, state.pose);
    const activation = Math.max(0, Math.min(1, state.trigger ?? 0));
    object.scale.setScalar(1 + activation * 0.12);
  }
  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  animate = () => {
    if (this.destroyed) return;
    const seconds = performance.now() / 1e3;
    this.scene.rotation.y = Math.sin(seconds * 0.18) * 0.035;
    this.renderer.render(this.scene, this.camera);
    this.copyPreviews();
    this.animationFrame = requestAnimationFrame(this.animate);
  };
  copyPreviews() {
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
};

// packages/frameulator/src/storage/IndexedDbStore.ts
var MemoryReportStore = class {
  report;
  native;
  async save(report) {
    this.report = structuredClone(report);
  }
  async latest() {
    return this.report ? structuredClone(this.report) : void 0;
  }
  async clear() {
    this.report = void 0;
    this.native = void 0;
  }
  async saveNative(evidence) {
    this.native = structuredClone(evidence);
  }
  async latestNative() {
    return this.native ? structuredClone(this.native) : void 0;
  }
  close() {
  }
};
var IndexedDbReportStore = class _IndexedDbReportStore {
  constructor(database) {
    this.database = database;
  }
  static async create() {
    if (!("indexedDB" in globalThis)) throw new Error("IndexedDB is not available in this environment.");
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("frameulator", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("reports")) {
          request.result.createObjectStore("reports");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open Frameulator storage."));
    });
    return new _IndexedDbReportStore(database);
  }
  async save(report) {
    await this.transaction("readwrite", (store) => store.put(structuredClone(report), "latest"));
  }
  async latest() {
    return this.transaction("readonly", (store) => store.get("latest"));
  }
  async clear() {
    await Promise.all([
      this.transaction("readwrite", (store) => store.delete("latest")),
      this.transaction("readwrite", (store) => store.delete("latest-native"))
    ]);
  }
  async saveNative(evidence) {
    await this.transaction("readwrite", (store) => store.put(structuredClone(evidence), "latest-native"));
  }
  async latestNative() {
    return this.transaction("readonly", (store) => store.get("latest-native"));
  }
  close() {
    this.database.close();
  }
  transaction(mode, action) {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("reports", mode);
      const request = action(transaction.objectStore("reports"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Frameulator storage request failed."));
    });
  }
};

// packages/frameulator/src/WorkerClient.ts
var WorkerClient = class _WorkerClient {
  worker;
  pending = /* @__PURE__ */ new Map();
  requestId = 0;
  blobUrl;
  constructor(worker, blobUrl) {
    this.worker = worker;
    this.blobUrl = blobUrl;
    worker.addEventListener("message", (event) => this.receive(event.data));
    worker.addEventListener("error", (event) => this.failAll(event.error ?? new Error(event.message)));
  }
  static async create(options) {
    let worker;
    let blobUrl;
    if (options.workerUrl) {
      worker = new Worker(String(options.workerUrl), { name: "frameulator", type: "module" });
    } else {
      if (false) {
        throw new Error("Inline Worker code is unavailable; provide workerUrl or set worker to false.");
      }
      const blob = new Blob(['var A=Object.freeze({id:"steam-frame",label:"Steam Frame browser contract",version:"0.2.0",simulated:!0,evidenceLevel:"F1-browser-wasm",display:{eyeWidth:1440,eyeHeight:1440,refreshRatesHz:[72,90,120],defaultRefreshRateHz:72},hardware:{architecture:"aarch64",memoryMiB:16384},gpu:{vendor:"Qualcomm",family:"Adreno",driver:"simulated-contract",api:"Vulkan 1.3 contract"},openxr:{apiVersion:"1.1",runtime:"SteamVR contract model",viewConfiguration:"PRIMARY_STEREO"}});function f(t){if(t===void 0||t==="steam-frame")return A;if(!t.simulated||t.evidenceLevel!=="F1-browser-wasm")throw new Error("Browser profiles must be explicitly labeled simulated at F1-browser-wasm.");return t}var y=Object.freeze([{id:"normal-session",label:"Normal OpenXR session",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"assert-state",state:"FOCUSED"}]},{id:"tracking-recovery",label:"Tracking loss and recovery",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"event",event:"tracking-lost"},{action:"assert-state",state:"LOSS_PENDING"},{action:"event",event:"tracking-restored"},{action:"assert-state",state:"FOCUSED"}]}]);function u(t){if(typeof t!="string")return t;let e=y.find(a=>a.id===t);if(!e)throw new Error(`Unknown Frameulator scenario: ${t}`);return structuredClone(e)}var R={position:[0,1.65,0],orientation:[0,0,0,1]};function _(){return{headPose:structuredClone(R),controllers:{left:{pose:{position:[-.25,1.25,-.35],orientation:[0,0,0,1]}},right:{pose:{position:[.25,1.25,-.35],orientation:[0,0,0,1]}}},trackingAvailable:!0,compositorFrames:0,firmwareState:"booted"}}function g(){return Object.fromEntries(Object.entries({hardware:"ARM64 ABI, memory and timing contract model",gpu:"Qualcomm/Adreno capability and budget model",vulkan:"Vulkan-like resource and submission validator",openxr:"OpenXR 1.1 session and action state machine",compositor:"Gamescope-like focus, pacing and frame queue model",firmware:"Deterministic headset firmware lifecycle model",tracking:"Synthetic pose, drift, prediction and loss model",controllers:"Virtual Steam Frame controller actions",host:"In-browser service and socket contract message bus"}).map(([e,a])=>[e,{name:e,status:"simulated",simulated:!0,detail:a}]))}function S(t,e,a){switch(t){case"hardware.capabilities":return{...e.hardware,littleEndian:!0,simulated:!0};case"gpu.capabilities":return{...e.gpu,maxImageDimension2D:8192,simulated:!0};case"vulkan.capabilities":return{apiVersion:"1.3",queues:["graphics","compute","transfer"],nativeDriver:!1,simulated:!0};case"openxr.capabilities":return{...e.openxr,sessionStateModel:!0,nativeRuntime:!1,simulated:!0};case"compositor.status":return{queuedFrames:0,presentedFrames:a.compositorFrames,focused:!0,simulated:!0};case"firmware.status":return{state:a.firmwareState,version:"simulated-0.2.0",hardwareFirmware:!1,simulated:!0};case"tracking.status":return{available:a.trackingAvailable,pose:a.headPose,source:"synthetic",simulated:!0};case"controllers.status":return{connected:["left","right"],states:a.controllers,physicalControllers:!1,simulated:!0};case"host.status":return{transport:"worker-message-bus",nativeSockets:!1,services:9,simulated:!0};case"services.status":return g();default:throw new Error(`Unsupported Frameulator method: ${t}`)}}function C(t){if(typeof atob=="function"){let c=atob(t);return Uint8Array.from(c,l=>l.charCodeAt(0))}let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",a=t.replace(/=+$/,""),n=new Uint8Array(Math.floor(a.length*6/8)),r=0,i=0,m=0;for(let c of a){let l=e.indexOf(c);l<0||(r=r<<6|l,i+=6,i>=8&&(i-=8,n[m++]=r>>i&255))}return n}async function k(t){let e=await fetch(t);if(!e.ok)throw new Error(`Unable to load Frameulator WASM (${e.status}).`);return e.arrayBuffer()}async function b(t){let e=t.wasmBytes;if(!e&&t.wasmBase64&&(e=C(t.wasmBase64)),!e&&t.wasmUrl&&(e=await k(t.wasmUrl)),!e)throw new Error("No Frameulator WASM source was provided.");let a=e instanceof Uint8Array?e:new Uint8Array(e),i=(await WebAssembly.instantiate(a,{})).instance.exports;if(i.frameulator_abi_version()!==1)throw new Error("Unsupported Frameulator WASM ABI.");return i}var x=["IDLE","READY","SYNCHRONIZED","VISIBLE","FOCUSED","STOPPING","LOSS_PENDING","EXITING"],N={"tracking-lost":1,"tracking-restored":2,"runtime-exit":3,"focus-lost":4},p=class t{profile;wasm;world;lastReport;constructor(e,a){this.profile=e,this.wasm=a,this.world=_()}static async create(e={}){let n=!!(e.wasmBytes||e.wasmBase64||e.wasmUrl),r=await b({wasmBytes:e.wasmBytes,wasmBase64:e.wasmBase64||"",wasmUrl:n?e.wasmUrl:new URL("./frameulator.wasm",import.meta.url)});return r.frameulator_reset(),new t(f(e.profile),r)}get sessionState(){return x[this.wasm.frameulator_session_state()]??"IDLE"}get frameCount(){return Number(this.wasm.frameulator_frame_count())}get elapsedMilliseconds(){return Number(this.wasm.frameulator_elapsed_micros())/1e3}get snapshot(){return{sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,headPose:structuredClone(this.world.headPose),controllers:structuredClone(this.world.controllers),simulated:!0}}reset(){this.wasm.frameulator_reset(),this.world=_(),this.lastReport=void 0}start(){return this.wasm.frameulator_start(),this.sessionState}stop(){return this.wasm.frameulator_stop(),this.sessionState}step(e){if(!Number.isFinite(e)||e<0||e>1e3)throw new Error("Frame step must be between 0 and 1000 milliseconds.");return this.wasm.frameulator_step(Math.round(e*1e3)),this.world.compositorFrames+=1,this.sessionState}setHeadPose(e){this.world.headPose=structuredClone(e)}setControllerState(e,a){this.world.controllers[e]={...this.world.controllers[e],...structuredClone(a)}}injectEvent(e){return this.wasm.frameulator_inject_event(N[e]),e==="tracking-lost"&&(this.world.trackingAvailable=!1),e==="tracking-restored"&&(this.world.trackingAvailable=!0),this.sessionState}call(e){return S(e,this.profile,this.world)}async runScenario(e){let a=u(e),n=[];this.reset();for(let r of a.steps)switch(r.action){case"start":this.start();break;case"stop":this.stop();break;case"step":this.step(r.milliseconds);break;case"event":this.injectEvent(r.event);break;case"assert-state":{let i=this.sessionState;n.push({expected:r.state,actual:i,passed:i===r.state});break}}return this.lastReport={schemaVersion:2,frameulatorVersion:"0.2.0",scenario:a.id,profile:this.profile.id,simulated:!0,evidenceLevel:"F1-browser-wasm",passed:n.length>0&&n.every(r=>r.passed),sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,assertions:n,services:g(),generatedAt:new Date().toISOString()},structuredClone(this.lastReport)}exportReport(){if(!this.lastReport)throw new Error("Run a scenario before exporting a report.");return structuredClone(this.lastReport)}};var D=["IDLE","READY","SYNCHRONIZED","VISIBLE","FOCUSED","STOPPING","LOSS_PENDING"],I=["OFFLINE","AVAILABLE","DEGRADED","FAILED"],F=["ABSENT","STAGING","DEPLOYED","UPDATING","ROLLING_BACK","REMOVING","FAILED"],P=["IDLE","LAUNCHING","RUNNING","STOPPING","CRASHED"],M=["NOT_RUN","RUNNING","PASSED","FAILED","BLOCKED"],O=["EMPTY","LOADED","VALIDATED","BUILT","FAILED"],v=["RESET","DEVICE_ATTACHED","RELEASE_VERIFIED","DEPLOYMENT_STAGED","DEPLOYMENT_COMPLETED","SESSION_LAUNCHING","SESSION_RUNNING","SESSION_STOPPING","SESSION_STOPPED","UPDATE_STARTED","UPDATE_COMPLETED","UPDATE_FAILED","ROLLBACK_STARTED","ROLLBACK_COMPLETED","REMOVAL_STARTED","REMOVAL_COMPLETED","SESSION_CRASHED","PROJECT_LOADED","PROJECT_VALIDATED","PROJECT_BUILT","TEST_STARTED","TEST_PASSED","TEST_FAILED","SESSION_RECOVERED"],L={"attach-device":1,"verify-release":2,stage:3,launch:4,stop:5,update:6,"fail-update":7,rollback:8,remove:9,crash:10,"load-project":11,"validate-project":12,"build-project":13,"start-test":14,"pass-test":15,"fail-test":16,recover:17},d=class t{constructor(e){this.exports=e}static async create(e){let a=e instanceof Uint8Array?e:new Uint8Array(e),r=(await WebAssembly.instantiate(a,{})).instance.exports;if(typeof r.agora_capsule_abi_version!="function"||r.agora_capsule_abi_version()!==2)throw new Error("Unsupported Agora browser capsule ABI. Frameulator 0.2.0 requires ABI 2.");if(r.agora_capsule_version()!==2||r.agora_capsule_stereo_contract_valid()!==1)throw new Error("Agora browser capsule failed its version or stereo contract check.");let m=["agora_capsule_management_command","agora_capsule_management_device_state","agora_capsule_management_deployment_state","agora_capsule_management_session_state","agora_capsule_management_test_state","agora_capsule_management_project_state","agora_capsule_management_current_release","agora_capsule_management_previous_release","agora_capsule_management_event_count","agora_capsule_management_last_event","agora_capsule_management_event_sequence","agora_capsule_management_event_kind","agora_capsule_management_event_value","agora_capsule_tracking_available"].find(c=>typeof r[c]!="function");if(m)throw new Error(`Agora browser capsule ABI 2 is incomplete: ${m}.`);return r.agora_capsule_reset(),new t(r)}reset(){this.exports.agora_capsule_reset()}start(){if(this.exports.agora_capsule_start()===0)throw new Error("Deploy and launch Agora before starting OpenXR.")}stop(){this.exports.agora_capsule_stop()}step(e){this.exports.agora_capsule_step(Math.round(e*1e3))}setTracking(e){this.exports.agora_capsule_set_tracking(e?1:0)}command(e,a=0){let n=this.exports.agora_capsule_management_command(L[e],a);if(n!==0)throw new Error(`Agora rejected management command ${e} (${n}).`);return this.managementSnapshot}prepareRelease(e=1){return this.command("attach-device"),this.command("verify-release",e),this.command("load-project"),this.command("validate-project"),this.command("build-project")}stage(){return this.command("stage"),this.step(0),this.managementSnapshot}launch(){return this.command("launch"),this.step(0),this.start(),this.managementSnapshot}stopManaged(){return this.stop(),this.command("stop"),this.step(0),this.managementSnapshot}update(e){return this.command("update",e),this.step(0),this.managementSnapshot}failUpdate(e){return this.command("update",e),this.command("fail-update"),this.step(0),this.managementSnapshot}rollback(){return this.command("rollback"),this.step(0),this.managementSnapshot}remove(){return this.command("remove"),this.step(0),this.managementSnapshot}crash(){return this.command("crash"),this.setTracking(!1),this.managementSnapshot}recover(){return this.command("recover"),this.setTracking(!0),this.managementSnapshot}get managementSnapshot(){let e=this.exports.agora_capsule_management_event_count(),a=Array.from({length:e},(n,r)=>({sequence:this.exports.agora_capsule_management_event_sequence(r),kind:v[this.exports.agora_capsule_management_event_kind(r)]??"UNKNOWN",value:this.exports.agora_capsule_management_event_value(r)}));return{protocol:"agora-management/2",deviceState:I[this.exports.agora_capsule_management_device_state()]??"FAILED",deploymentState:F[this.exports.agora_capsule_management_deployment_state()]??"FAILED",applicationSessionState:P[this.exports.agora_capsule_management_session_state()]??"CRASHED",testState:M[this.exports.agora_capsule_management_test_state()]??"FAILED",projectState:O[this.exports.agora_capsule_management_project_state()]??"FAILED",currentRelease:this.exports.agora_capsule_management_current_release(),previousRelease:this.exports.agora_capsule_management_previous_release(),eventCount:e,lastEvent:v[this.exports.agora_capsule_management_last_event()]??"UNKNOWN",events:a}}get snapshot(){return{sessionState:D[this.exports.agora_capsule_session_state()]??"UNKNOWN",frameCount:Number(this.exports.agora_capsule_frame_count()),elapsedMilliseconds:Number(this.exports.agora_capsule_elapsed_micros())/1e3,scenePhaseRadians:this.exports.agora_capsule_scene_phase_milliradians()/1e3,stereoContractValid:this.exports.agora_capsule_stereo_contract_valid()===1,producer:"agora-browser-capsule",capsuleAbi:2,trackingAvailable:this.exports.agora_capsule_tracking_available()===1,warnings:this.exports.agora_capsule_tracking_available()===1?[]:["TRACKING_UNAVAILABLE"],management:this.managementSnapshot}}};function E(t,e){t.reset(),t.prepareRelease(1),t.stage(),t.command("start-test");for(let r of u(e).steps)switch(r.action){case"start":t.launch();break;case"stop":t.stopManaged();break;case"step":t.step(r.milliseconds);break;case"event":h(t,r.event);break;case"assert-state":break}let a=t.snapshot,n=a.stereoContractValid&&!["LOSS_PENDING","UNKNOWN"].includes(a.sessionState);return t.command(n?"pass-test":"fail-test"),t.snapshot}function h(t,e){e==="tracking-lost"&&t.setTracking(!1),e==="tracking-restored"&&t.setTracking(!0),e==="runtime-exit"&&t.managementSnapshot.applicationSessionState==="RUNNING"&&t.stopManaged()}function w(t,e,a=0){switch(e){case"stage":t.stage();break;case"launch":t.launch();break;case"stop":t.stopManaged();break;case"update":t.update(a);break;case"fail-update":t.failUpdate(a);break;case"rollback":t.rollback();break;case"remove":t.remove();break;case"crash":t.crash();break;case"recover":t.recover();break;default:t.command(e,a);break}return t.snapshot}var s,o;async function T(t){if(t.protocol!=="frameulator/2")throw new Error("Frameulator Worker protocol 2 is required.");if(t.method==="initialize")return s=await p.create(t.parameters??{}),{...s.snapshot,profile:s.profile,wasmAbi:1};if(!s)throw new Error("Frameulator Worker is not initialized.");switch(t.method){case"loadCapsule":return o=await d.create(t.parameters),o.snapshot;case"prepareRelease":if(!o)throw new Error("Agora capsule is not loaded.");return o.prepareRelease(Number(t.parameters)||1),{...s.snapshot,applicationFrame:o.snapshot};case"managementCommand":{if(!o)throw new Error("Agora capsule is not loaded.");let{command:e,value:a}=t.parameters;return w(o,e,a),e==="launch"&&s.start(),e==="stop"&&(s.stop(),s.step(0)),e==="crash"&&s.injectEvent("runtime-exit"),(e==="recover"||e==="remove")&&s.reset(),{...s.snapshot,applicationFrame:o.snapshot}}case"unloadCapsule":return o=void 0,{unloaded:!0};case"start":return o?.start(),{state:s.start(),applicationFrame:o?.snapshot};case"stop":return o?.stop(),{state:s.stop(),applicationFrame:o?.snapshot};case"step":return s.step(Number(t.parameters)),o?.step(Number(t.parameters)),{...s.snapshot,applicationFrame:o?.snapshot};case"setHeadPose":return s.setHeadPose(t.parameters),s.snapshot;case"setControllerState":{let{hand:e,state:a}=t.parameters;return s.setControllerState(e,a),s.snapshot}case"injectEvent":return o&&h(o,t.parameters),s.injectEvent(t.parameters),{...s.snapshot,state:s.sessionState,applicationFrame:o?.snapshot};case"runScenario":return{report:await s.runScenario(t.parameters),applicationFrame:o?E(o,t.parameters):void 0};case"exportReport":return s.exportReport();case"snapshot":return{...s.snapshot,applicationFrame:o?.snapshot};default:return s.call(t.method)}}self.addEventListener("message",async t=>{let e=t.data,a={protocol:"frameulator/2",requestId:e.requestId,ok:!0};try{a.result=await T(e)}catch(n){a.ok=!1,a.error=n instanceof Error?n.message:String(n)}self.postMessage(a)});\n'], { type: "text/javascript" });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl, { name: "frameulator", type: "module" });
    }
    const client = new _WorkerClient(worker, blobUrl);
    const embedded = "";
    const hasExplicitSource = Boolean(options.wasmBytes || options.wasmBase64 || options.wasmUrl);
    await client.request("initialize", {
      profile: options.profile,
      wasmBytes: options.wasmBytes,
      wasmBase64: options.wasmBase64 || embedded,
      wasmUrl: hasExplicitSource || embedded ? options.wasmUrl : new URL("./frameulator.wasm", import.meta.url).href
    });
    return client;
  }
  request(method, parameters) {
    const requestId = ++this.requestId;
    const request = { protocol: "frameulator/2", requestId, method, parameters };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Frameulator request timed out: ${method}`));
      }, 1e4);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage(request);
    });
  }
  destroy() {
    this.failAll(new Error("Frameulator Worker was destroyed."));
    this.worker.terminate();
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = void 0;
  }
  receive(response) {
    if (response.protocol !== "frameulator/2") {
      this.failAll(new Error("Frameulator Worker protocol mismatch; version 2 is required."));
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error ?? "Unknown Frameulator Worker error."));
  }
  failAll(error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
};

// packages/frameulator/src/application/hash.ts
var constants = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function rotateRight(value, bits) {
  return value >>> bits | value << 32 - bits;
}
var IncrementalSha256 = class {
  state = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  buffer = new Uint8Array(64);
  words = new Uint32Array(64);
  bufferLength = 0;
  bytesHashed = 0;
  finished = false;
  update(input) {
    if (this.finished) throw new Error("SHA-256 digest has already been finalized.");
    this.bytesHashed += input.byteLength;
    let offset = 0;
    while (offset < input.byteLength) {
      const length = Math.min(64 - this.bufferLength, input.byteLength - offset);
      this.buffer.set(input.subarray(offset, offset + length), this.bufferLength);
      this.bufferLength += length;
      offset += length;
      if (this.bufferLength === 64) {
        this.compress(this.buffer);
        this.bufferLength = 0;
      }
    }
    return this;
  }
  digestHex() {
    return Array.from(this.digest(), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  digest() {
    if (!this.finished) {
      const bitLengthHigh = Math.floor(this.bytesHashed / 536870912);
      const bitLengthLow = this.bytesHashed << 3 >>> 0;
      this.buffer[this.bufferLength++] = 128;
      if (this.bufferLength > 56) {
        this.buffer.fill(0, this.bufferLength);
        this.compress(this.buffer);
        this.bufferLength = 0;
      }
      this.buffer.fill(0, this.bufferLength, 56);
      const view2 = new DataView(this.buffer.buffer);
      view2.setUint32(56, bitLengthHigh, false);
      view2.setUint32(60, bitLengthLow, false);
      this.compress(this.buffer);
      this.finished = true;
    }
    const result = new Uint8Array(32);
    const view = new DataView(result.buffer);
    this.state.forEach((value, index) => view.setUint32(index * 4, value, false));
    return result;
  }
  compress(chunk) {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let index = 0; index < 16; index += 1) this.words[index] = view.getUint32(index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a2 = this.words[index - 15];
      const b2 = this.words[index - 2];
      const s0 = rotateRight(a2, 7) ^ rotateRight(a2, 18) ^ a2 >>> 3;
      const s1 = rotateRight(b2, 17) ^ rotateRight(b2, 19) ^ b2 >>> 10;
      this.words[index] = this.words[index - 16] + s0 + this.words[index - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this.state;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = e & f ^ ~e & g;
      const temporary1 = h + s1 + choice + constants[index] + this.words[index] >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = a & b ^ a & c ^ b & c;
      const temporary2 = s0 + majority >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + temporary1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = temporary1 + temporary2 >>> 0;
    }
    this.state[0] = this.state[0] + a >>> 0;
    this.state[1] = this.state[1] + b >>> 0;
    this.state[2] = this.state[2] + c >>> 0;
    this.state[3] = this.state[3] + d >>> 0;
    this.state[4] = this.state[4] + e >>> 0;
    this.state[5] = this.state[5] + f >>> 0;
    this.state[6] = this.state[6] + g >>> 0;
    this.state[7] = this.state[7] + h >>> 0;
  }
};
async function sha256Blob(blob, progress) {
  const digest = new IncrementalSha256();
  const reader = blob.stream().getReader();
  let processed = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    digest.update(value);
    processed += value.byteLength;
    progress?.(processed, blob.size);
  }
  return digest.digestHex();
}
function sha256Bytes(bytes) {
  return new IncrementalSha256().update(bytes).digestHex();
}

// packages/frameulator/src/application/ApplicationGate.ts
var ApplicationGate = class {
  constructor(options) {
    this.options = options;
  }
  currentState = "EMPTY";
  selected;
  get state() {
    return this.currentState;
  }
  get verification() {
    return this.selected ? structuredClone(this.selected) : void 0;
  }
  async verify(input) {
    const name = input.name ?? "";
    if (!name.toLowerCase().endsWith(".flatpak")) return this.reject("Select a .flatpak bundle.", "", name, input.size);
    if (input.size <= 0) return this.reject("The selected Flatpak is empty.", "", name, input.size);
    if (input.size > this.options.maximumBytes) {
      return this.reject(
        `The selected Flatpak exceeds the ${Math.floor(this.options.maximumBytes / 1048576)} MB limit.`,
        "",
        name,
        input.size
      );
    }
    this.setState("HASHING", "Calculating the Flatpak SHA-256 locally.", 0);
    const flatpakSha256 = await sha256Blob(input, (processed, total) => {
      this.options.onState("HASHING", "Calculating the Flatpak SHA-256 locally.", total ? processed / total : 0);
    });
    const release = this.options.releases.find((candidate) => candidate.flatpakSha256 === flatpakSha256);
    if (!release) {
      return this.reject("This Flatpak is not in the trusted Agora release registry.", flatpakSha256, name, input.size);
    }
    this.setState("VERIFIED", `Verified ${release.appId} ${release.version}.`, 1);
    this.setState("LOADING_CAPSULE", "Loading the matching Agora browser capsule.");
    const capsuleUrl = this.resolveCapsuleUrl(release.browserWasmFile);
    const response = await fetch(capsuleUrl);
    if (!response.ok) {
      return this.reject(`Unable to load the matching capsule (${response.status}).`, flatpakSha256, name, input.size);
    }
    const capsuleBytes = new Uint8Array(await response.arrayBuffer());
    if (sha256Bytes(capsuleBytes) !== release.browserWasmSha256) {
      return this.reject(
        "The Agora browser capsule checksum does not match the signed registry.",
        flatpakSha256,
        name,
        input.size
      );
    }
    this.currentState = "READY";
    this.selected = { accepted: true, fileName: name, size: input.size, flatpakSha256, release: structuredClone(release) };
    this.options.onState("READY", `${release.appId} ${release.version} is ready for simulated execution.`, 1);
    return { verification: structuredClone(this.selected), capsuleBytes };
  }
  markRunning() {
    this.setState("RUNNING", "Agora browser capsule is running.");
  }
  markStopped() {
    this.setState("STOPPED", "Agora browser capsule stopped.");
  }
  markFailed(message) {
    this.setState("FAILED", message);
  }
  reset() {
    this.selected = void 0;
    this.setState("EMPTY", "Select an approved Agora Flatpak to begin.");
  }
  resolveCapsuleUrl(file) {
    try {
      return new URL(file, this.options.registryBaseUrl ?? (typeof document === "undefined" ? void 0 : document.baseURI));
    } catch {
      throw new Error("The release registry does not provide a resolvable capsule URL.");
    }
  }
  reject(message, flatpakSha256 = "", fileName = "", size = 0) {
    this.currentState = "REJECTED";
    this.selected = { accepted: false, fileName, size, flatpakSha256, reason: message };
    this.options.onState("REJECTED", message);
    throw new Error(message);
  }
  setState(state, detail, progress) {
    this.currentState = state;
    this.options.onState(state, detail, progress);
  }
};

// packages/frameulator/src/application/BrowserCapsule.ts
var states2 = ["IDLE", "READY", "SYNCHRONIZED", "VISIBLE", "FOCUSED", "STOPPING", "LOSS_PENDING"];
var deviceStates = ["OFFLINE", "AVAILABLE", "DEGRADED", "FAILED"];
var deploymentStates = ["ABSENT", "STAGING", "DEPLOYED", "UPDATING", "ROLLING_BACK", "REMOVING", "FAILED"];
var applicationStates = ["IDLE", "LAUNCHING", "RUNNING", "STOPPING", "CRASHED"];
var testStates = ["NOT_RUN", "RUNNING", "PASSED", "FAILED", "BLOCKED"];
var projectStates = ["EMPTY", "LOADED", "VALIDATED", "BUILT", "FAILED"];
var managementEvents = [
  "RESET",
  "DEVICE_ATTACHED",
  "RELEASE_VERIFIED",
  "DEPLOYMENT_STAGED",
  "DEPLOYMENT_COMPLETED",
  "SESSION_LAUNCHING",
  "SESSION_RUNNING",
  "SESSION_STOPPING",
  "SESSION_STOPPED",
  "UPDATE_STARTED",
  "UPDATE_COMPLETED",
  "UPDATE_FAILED",
  "ROLLBACK_STARTED",
  "ROLLBACK_COMPLETED",
  "REMOVAL_STARTED",
  "REMOVAL_COMPLETED",
  "SESSION_CRASHED",
  "PROJECT_LOADED",
  "PROJECT_VALIDATED",
  "PROJECT_BUILT",
  "TEST_STARTED",
  "TEST_PASSED",
  "TEST_FAILED",
  "SESSION_RECOVERED"
];
var managementCommands = {
  "attach-device": 1,
  "verify-release": 2,
  stage: 3,
  launch: 4,
  stop: 5,
  update: 6,
  "fail-update": 7,
  rollback: 8,
  remove: 9,
  crash: 10,
  "load-project": 11,
  "validate-project": 12,
  "build-project": 13,
  "start-test": 14,
  "pass-test": 15,
  "fail-test": 16,
  recover: 17
};
var BrowserCapsule = class _BrowserCapsule {
  constructor(exports) {
    this.exports = exports;
  }
  static async create(source) {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const result = await WebAssembly.instantiate(bytes, {});
    const exports = result.instance.exports;
    if (typeof exports.agora_capsule_abi_version !== "function" || exports.agora_capsule_abi_version() !== 2) {
      throw new Error("Unsupported Agora browser capsule ABI. Frameulator 0.2.0 requires ABI 2.");
    }
    if (exports.agora_capsule_version() !== 2 || exports.agora_capsule_stereo_contract_valid() !== 1) {
      throw new Error("Agora browser capsule failed its version or stereo contract check.");
    }
    const requiredManagementExports = [
      "agora_capsule_management_command",
      "agora_capsule_management_device_state",
      "agora_capsule_management_deployment_state",
      "agora_capsule_management_session_state",
      "agora_capsule_management_test_state",
      "agora_capsule_management_project_state",
      "agora_capsule_management_current_release",
      "agora_capsule_management_previous_release",
      "agora_capsule_management_event_count",
      "agora_capsule_management_last_event",
      "agora_capsule_management_event_sequence",
      "agora_capsule_management_event_kind",
      "agora_capsule_management_event_value",
      "agora_capsule_tracking_available"
    ];
    const missing = requiredManagementExports.find((name) => typeof exports[name] !== "function");
    if (missing) {
      throw new Error(`Agora browser capsule ABI 2 is incomplete: ${missing}.`);
    }
    exports.agora_capsule_reset();
    return new _BrowserCapsule(exports);
  }
  reset() {
    this.exports.agora_capsule_reset();
  }
  start() {
    if (this.exports.agora_capsule_start() === 0) throw new Error("Deploy and launch Agora before starting OpenXR.");
  }
  stop() {
    this.exports.agora_capsule_stop();
  }
  step(milliseconds) {
    this.exports.agora_capsule_step(Math.round(milliseconds * 1e3));
  }
  setTracking(available) {
    this.exports.agora_capsule_set_tracking(available ? 1 : 0);
  }
  command(command, value = 0) {
    const result = this.exports.agora_capsule_management_command(managementCommands[command], value);
    if (result !== 0) throw new Error(`Agora rejected management command ${command} (${result}).`);
    return this.managementSnapshot;
  }
  prepareRelease(generation = 1) {
    this.command("attach-device");
    this.command("verify-release", generation);
    this.command("load-project");
    this.command("validate-project");
    return this.command("build-project");
  }
  stage() {
    this.command("stage");
    this.step(0);
    return this.managementSnapshot;
  }
  launch() {
    this.command("launch");
    this.step(0);
    this.start();
    return this.managementSnapshot;
  }
  stopManaged() {
    this.stop();
    this.command("stop");
    this.step(0);
    return this.managementSnapshot;
  }
  update(generation) {
    this.command("update", generation);
    this.step(0);
    return this.managementSnapshot;
  }
  failUpdate(generation) {
    this.command("update", generation);
    this.command("fail-update");
    this.step(0);
    return this.managementSnapshot;
  }
  rollback() {
    this.command("rollback");
    this.step(0);
    return this.managementSnapshot;
  }
  remove() {
    this.command("remove");
    this.step(0);
    return this.managementSnapshot;
  }
  crash() {
    this.command("crash");
    this.setTracking(false);
    return this.managementSnapshot;
  }
  recover() {
    this.command("recover");
    this.setTracking(true);
    return this.managementSnapshot;
  }
  get managementSnapshot() {
    const eventCount = this.exports.agora_capsule_management_event_count();
    const events2 = Array.from({ length: eventCount }, (_, index) => ({
      sequence: this.exports.agora_capsule_management_event_sequence(index),
      kind: managementEvents[this.exports.agora_capsule_management_event_kind(index)] ?? "UNKNOWN",
      value: this.exports.agora_capsule_management_event_value(index)
    }));
    return {
      protocol: "agora-management/2",
      deviceState: deviceStates[this.exports.agora_capsule_management_device_state()] ?? "FAILED",
      deploymentState: deploymentStates[this.exports.agora_capsule_management_deployment_state()] ?? "FAILED",
      applicationSessionState: applicationStates[this.exports.agora_capsule_management_session_state()] ?? "CRASHED",
      testState: testStates[this.exports.agora_capsule_management_test_state()] ?? "FAILED",
      projectState: projectStates[this.exports.agora_capsule_management_project_state()] ?? "FAILED",
      currentRelease: this.exports.agora_capsule_management_current_release(),
      previousRelease: this.exports.agora_capsule_management_previous_release(),
      eventCount,
      lastEvent: managementEvents[this.exports.agora_capsule_management_last_event()] ?? "UNKNOWN",
      events: events2
    };
  }
  get snapshot() {
    return {
      sessionState: states2[this.exports.agora_capsule_session_state()] ?? "UNKNOWN",
      frameCount: Number(this.exports.agora_capsule_frame_count()),
      elapsedMilliseconds: Number(this.exports.agora_capsule_elapsed_micros()) / 1e3,
      scenePhaseRadians: this.exports.agora_capsule_scene_phase_milliradians() / 1e3,
      stereoContractValid: this.exports.agora_capsule_stereo_contract_valid() === 1,
      producer: "agora-browser-capsule",
      capsuleAbi: 2,
      trackingAvailable: this.exports.agora_capsule_tracking_available() === 1,
      warnings: this.exports.agora_capsule_tracking_available() === 1 ? [] : ["TRACKING_UNAVAILABLE"],
      management: this.managementSnapshot
    };
  }
};
function runCapsuleScenario(capsule, input) {
  capsule.reset();
  capsule.prepareRelease(1);
  capsule.stage();
  capsule.command("start-test");
  for (const step of resolveScenario(input).steps) {
    switch (step.action) {
      case "start":
        capsule.launch();
        break;
      case "stop":
        capsule.stopManaged();
        break;
      case "step":
        capsule.step(step.milliseconds);
        break;
      case "event":
        applyCapsuleEvent(capsule, step.event);
        break;
      case "assert-state":
        break;
    }
  }
  const snapshot = capsule.snapshot;
  const passed = snapshot.stereoContractValid && !["LOSS_PENDING", "UNKNOWN"].includes(snapshot.sessionState);
  capsule.command(passed ? "pass-test" : "fail-test");
  return capsule.snapshot;
}
function applyCapsuleEvent(capsule, event) {
  if (event === "tracking-lost") capsule.setTracking(false);
  if (event === "tracking-restored") capsule.setTracking(true);
  if (event === "runtime-exit" && capsule.managementSnapshot.applicationSessionState === "RUNNING") {
    capsule.stopManaged();
  }
}
function applyManagementCommand(capsule, command, value = 0) {
  switch (command) {
    case "stage":
      capsule.stage();
      break;
    case "launch":
      capsule.launch();
      break;
    case "stop":
      capsule.stopManaged();
      break;
    case "update":
      capsule.update(value);
      break;
    case "fail-update":
      capsule.failUpdate(value);
      break;
    case "rollback":
      capsule.rollback();
      break;
    case "remove":
      capsule.remove();
      break;
    case "crash":
      capsule.crash();
      break;
    case "recover":
      capsule.recover();
      break;
    default:
      capsule.command(command, value);
      break;
  }
  return capsule.snapshot;
}

// packages/frameulator/src/application/ReleaseRegistry.ts
function decodeBase642(value) {
  if (typeof atob === "function") {
    const decoded = atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/=+$/, "");
  const output = new Uint8Array(Math.floor(clean.length * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let index = 0;
  for (const character of clean) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Release signature contains invalid base64.");
    accumulator = accumulator << 6 | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = accumulator >> bits & 255;
    }
  }
  return output;
}
function exactBuffer(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
function validateRelease(release) {
  if (release.appId !== "dev.luminarylabs.Agora") throw new Error("Release registry contains an unsupported application ID.");
  if (!/^0\.0\.\d+$/.test(release.version)) throw new Error("Release registry contains an unsupported Agora version.");
  if (release.capsuleAbi !== 2 || release.managementProtocol !== "agora-management/2") {
    throw new Error("Release registry contains an unsupported Agora management capsule.");
  }
  if (!["x86_64", "aarch64"].includes(release.architecture)) throw new Error("Release registry contains an unsupported architecture.");
  if (!/^[0-9a-f]{40}$/.test(release.sourceCommit)) throw new Error("Release registry contains an invalid source commit.");
  if (!release.flatpakFile.toLowerCase().endsWith(".flatpak")) throw new Error("Release registry contains an invalid Flatpak filename.");
  if (!/^[0-9a-f]{64}$/.test(release.flatpakSha256)) throw new Error("Release registry contains an invalid Flatpak checksum.");
  if (!/^[0-9a-f]{64}$/.test(release.browserWasmSha256)) throw new Error("Release registry contains an invalid capsule checksum.");
  if (release.executionMode !== "browser-wasm-capsule") throw new Error("Release registry contains an unsupported execution mode.");
  if (!release.browserWasmFile) throw new Error("Release registry does not identify a browser capsule.");
}
async function verifyReleaseRegistry(document2, trustedKeys) {
  if (document2.schemaVersion !== 1 || document2.algorithm !== "Ed25519") {
    throw new Error("Unsupported Agora release registry format.");
  }
  const trustedKey = trustedKeys.find((key2) => key2.id === document2.keyId && key2.algorithm === "Ed25519");
  if (!trustedKey) throw new Error(`Release registry key is not trusted: ${document2.keyId}`);
  if (!document2.signature) throw new Error("Release registry is unsigned.");
  const key = await crypto.subtle.importKey(
    "raw",
    exactBuffer(decodeBase642(trustedKey.publicKeyBase64)),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    exactBuffer(decodeBase642(document2.signature)),
    exactBuffer(new TextEncoder().encode(JSON.stringify(document2.payload)))
  );
  if (!valid) throw new Error("Release registry signature verification failed.");
  if (!Array.isArray(document2.payload.releases)) throw new Error("Release registry has no release list.");
  if (document2.payload.releases.length === 0) throw new Error("Release registry contains no approved releases.");
  document2.payload.releases.forEach(validateRelease);
  const unique = new Set(document2.payload.releases.map((release) => release.flatpakSha256));
  if (unique.size !== document2.payload.releases.length) throw new Error("Release registry contains duplicate Flatpak checksums.");
  return structuredClone(document2.payload.releases);
}
async function loadReleaseRegistry(source, trustedKeys) {
  if (!source) return { releases: [] };
  if (typeof source !== "string" && !(source instanceof URL)) {
    return { releases: await verifyReleaseRegistry(source, trustedKeys) };
  }
  const url = new URL(String(source), typeof document === "undefined" ? void 0 : document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load Agora release registry (${response.status}).`);
  const registry = await response.json();
  return { releases: await verifyReleaseRegistry(registry, trustedKeys), baseUrl: url };
}

// packages/frameulator/src/Frameulator.ts
var LocalTransport = class _LocalTransport {
  constructor(kernel) {
    this.kernel = kernel;
  }
  capsule;
  static async create(options) {
    return new _LocalTransport(await FrameulatorKernel.create(options));
  }
  async request(method, parameters) {
    switch (method) {
      case "loadCapsule":
        this.capsule = await BrowserCapsule.create(parameters);
        return this.capsule.snapshot;
      case "prepareRelease": {
        if (!this.capsule) throw new Error("Agora capsule is not loaded.");
        this.capsule.prepareRelease(Number(parameters) || 1);
        return { ...this.kernel.snapshot, applicationFrame: this.capsule.snapshot };
      }
      case "managementCommand": {
        if (!this.capsule) throw new Error("Agora capsule is not loaded.");
        const { command, value } = parameters;
        applyManagementCommand(this.capsule, command, value);
        if (command === "launch") this.kernel.start();
        if (command === "stop") {
          this.kernel.stop();
          this.kernel.step(0);
        }
        if (command === "crash") this.kernel.injectEvent("runtime-exit");
        if (command === "recover" || command === "remove") this.kernel.reset();
        return { ...this.kernel.snapshot, applicationFrame: this.capsule.snapshot };
      }
      case "unloadCapsule":
        this.capsule = void 0;
        return { unloaded: true };
      case "start":
        this.capsule?.start();
        return { state: this.kernel.start(), applicationFrame: this.capsule?.snapshot };
      case "stop":
        this.capsule?.stop();
        return { state: this.kernel.stop(), applicationFrame: this.capsule?.snapshot };
      case "step":
        this.kernel.step(Number(parameters));
        this.capsule?.step(Number(parameters));
        return { ...this.kernel.snapshot, applicationFrame: this.capsule?.snapshot };
      case "setHeadPose":
        this.kernel.setHeadPose(parameters);
        return this.kernel.snapshot;
      case "setControllerState": {
        const { hand, state } = parameters;
        this.kernel.setControllerState(hand, state);
        return this.kernel.snapshot;
      }
      case "injectEvent": {
        const event = parameters;
        if (this.capsule) applyCapsuleEvent(this.capsule, event);
        this.kernel.injectEvent(event);
        return { ...this.kernel.snapshot, state: this.kernel.sessionState, applicationFrame: this.capsule?.snapshot };
      }
      case "runScenario":
        return {
          report: await this.kernel.runScenario(parameters),
          applicationFrame: this.capsule ? runCapsuleScenario(this.capsule, parameters) : void 0
        };
      case "exportReport":
        return this.kernel.exportReport();
      case "snapshot":
        return { ...this.kernel.snapshot, applicationFrame: this.capsule?.snapshot };
      default:
        return this.kernel.call(method);
    }
  }
  destroy() {
  }
};
var Frameulator = class _Frameulator extends EventTarget {
  constructor(transport, store, releases, registryBaseUrl, maximumFlatpakBytes) {
    super();
    this.transport = transport;
    this.store = store;
    this.applicationGate = new ApplicationGate({
      releases,
      registryBaseUrl,
      maximumBytes: maximumFlatpakBytes,
      onState: (state, detail, progress) => this.emit("frameulator-application", { state, detail, progress })
    });
  }
  version = "0.2.0";
  simulated = true;
  renderer;
  running = false;
  frameRequest = 0;
  previousTime = 0;
  stepping = false;
  importedEvidence;
  applicationGate;
  lastReport;
  currentManagement;
  static async create(options = {}) {
    if (options.network && options.network !== "disabled") {
      throw new Error("Frameulator 0.2.0 only supports network: disabled.");
    }
    const registry = await loadReleaseRegistry(options.releaseRegistry, options.trustedReleaseKeys ?? []);
    const maximumFlatpakBytes = options.maximumFlatpakBytes ?? 200 * 1024 * 1024;
    if (!Number.isSafeInteger(maximumFlatpakBytes) || maximumFlatpakBytes <= 0) {
      throw new Error("maximumFlatpakBytes must be a positive integer.");
    }
    const useWorker = options.worker !== false && typeof Worker !== "undefined";
    const transport = useWorker ? await WorkerClient.create(options) : await LocalTransport.create(options);
    let store = new MemoryReportStore();
    if (options.storage !== "memory" && typeof indexedDB !== "undefined") {
      try {
        store = await IndexedDbReportStore.create();
      } catch {
        store = new MemoryReportStore();
      }
    }
    const frameulator = new _Frameulator(transport, store, registry.releases, registry.baseUrl, maximumFlatpakBytes);
    if (options.container && options.renderer !== "none") {
      frameulator.renderer = new FrameulatorRenderer(options.container);
    }
    frameulator.emit("frameulator-ready", { version: frameulator.version, simulated: true, applicationState: "EMPTY" });
    return frameulator;
  }
  get applicationState() {
    return this.applicationGate.state;
  }
  get flatpakVerification() {
    return this.applicationGate.verification;
  }
  async selectFlatpak(input) {
    try {
      const result = await this.applicationGate.verify(input);
      const snapshot = await this.transport.request("loadCapsule", result.capsuleBytes);
      if (!snapshot.stereoContractValid) throw new Error("Agora capsule did not validate its stereo scene contract.");
      if (snapshot.capsuleAbi !== result.verification.release?.capsuleAbi) {
        throw new Error("Agora capsule ABI does not match its signed release record.");
      }
      const prepared = await this.transport.request("prepareRelease", 1);
      this.updateManagement(prepared.applicationFrame.management);
      this.emit("frameulator-flatpak-verified", result.verification);
      this.emit("frameulator-package", result.verification);
      return result.verification;
    } catch (error) {
      if (this.applicationGate.state !== "REJECTED") {
        this.applicationGate.markFailed(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }
  async removeApplication() {
    if (this.running || this.currentManagement?.applicationSessionState === "RUNNING") await this.stop();
    if (this.currentManagement && this.currentManagement.deploymentState !== "ABSENT") {
      await this.runManagementCommand("remove");
    }
    await this.transport.request("unloadCapsule");
    await this.store.clear();
    this.lastReport = void 0;
    this.currentManagement = void 0;
    this.renderer?.clearApplicationFrame();
    this.applicationGate.reset();
  }
  setEyePreviews(left, right) {
    this.renderer?.setEyePreviews(left, right);
  }
  async start() {
    await this.launchCapsule();
  }
  async rehearseDeploy() {
    this.requireApplication();
    return this.runManagementCommand("stage");
  }
  async prepareDevice() {
    this.requireApplication();
    if (!this.currentManagement) throw new Error("Agora management state is unavailable.");
    return structuredClone(this.currentManagement);
  }
  async stopCapsule() {
    await this.stop();
  }
  async restartCapsule() {
    if (this.currentManagement?.applicationSessionState === "RUNNING") await this.stopCapsule();
    if (this.currentManagement?.applicationSessionState === "CRASHED") await this.recoverCrash();
    await this.launchCapsule();
  }
  async launchCapsule() {
    this.requireApplication();
    if (this.currentManagement?.deploymentState !== "DEPLOYED") {
      throw new Error("DEPLOYMENT_REQUIRED: rehearse deployment before launching Agora.");
    }
    const result = await this.transport.request("managementCommand", { command: "launch" });
    this.renderer?.update(result);
    this.updateManagement(result.applicationFrame.management);
    this.applicationGate.markRunning();
    this.running = true;
    this.previousTime = performance.now();
    if (typeof requestAnimationFrame === "function") this.frameRequest = requestAnimationFrame(this.tick);
    this.emit("frameulator-state", result);
  }
  async stop() {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    const result = await this.transport.request("managementCommand", { command: "stop" });
    this.renderer?.update(result);
    this.updateManagement(result.applicationFrame.management);
    if (this.applicationGate.verification?.accepted) this.applicationGate.markStopped();
    this.emit("frameulator-state", result);
  }
  async simulateUpdate(generation = 2) {
    this.requireApplication();
    return this.runManagementCommand("update", generation);
  }
  async simulateFailedUpdate(generation = 2) {
    this.requireApplication();
    return this.runManagementCommand("fail-update", generation);
  }
  async simulateRollback() {
    this.requireApplication();
    return this.runManagementCommand("rollback");
  }
  async simulateCrash() {
    this.requireApplication();
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    return this.runManagementCommand("crash");
  }
  async recoverCrash() {
    this.requireApplication();
    return this.runManagementCommand("recover");
  }
  async runManagementScenario(name) {
    this.requireApplication();
    if (name === "managed-normal-session") {
      if (this.currentManagement?.deploymentState === "ABSENT") await this.rehearseDeploy();
      await this.launchCapsule();
      await this.stopCapsule();
    } else if (name === "update-rollback") {
      if (this.currentManagement?.deploymentState === "ABSENT") await this.rehearseDeploy();
      const next = (this.currentManagement?.currentRelease ?? 1) + 1;
      await this.simulateUpdate(next);
      await this.simulateRollback();
    } else {
      if (this.currentManagement?.deploymentState === "ABSENT") await this.rehearseDeploy();
      await this.launchCapsule();
      await this.simulateCrash();
      await this.recoverCrash();
      await this.launchCapsule();
    }
    if (!this.currentManagement) throw new Error("Agora management scenario produced no state.");
    return structuredClone(this.currentManagement);
  }
  async setHeadPose(pose) {
    const snapshot = await this.transport.request("setHeadPose", pose);
    this.renderer?.update(snapshot);
  }
  async setControllerState(hand, state) {
    const snapshot = await this.transport.request("setControllerState", { hand, state });
    this.renderer?.update(snapshot);
  }
  async injectEvent(event) {
    const result = await this.transport.request("injectEvent", event);
    this.renderer?.update(result);
    this.emit("frameulator-state", result);
  }
  async call(method) {
    return this.transport.request(method);
  }
  async run(input) {
    return this.runScenario(input);
  }
  async runScenario(input) {
    this.requireApplication();
    const output = await this.transport.request("runScenario", input);
    const report = {
      ...output.report,
      application: this.applicationEvidence(output.applicationFrame),
      management: this.managementEvidence(output.applicationFrame)
    };
    if (output.applicationFrame) this.updateManagement(output.applicationFrame.management);
    this.lastReport = structuredClone(report);
    if (["STOPPING", "IDLE"].includes(report.sessionState)) this.applicationGate.markStopped();
    else this.applicationGate.markRunning();
    await this.store.save(report);
    const snapshot = await this.transport.request("snapshot");
    this.renderer?.update(snapshot);
    this.emit("frameulator-result", report);
    this.emit("frameulator-evidence", report);
    this.emit("frameulator-state", { state: report.sessionState });
    return report;
  }
  async exportReport() {
    this.lastReport ??= await this.store.latest();
    if (!this.lastReport) throw new Error("Run a verified Agora scenario before exporting a report.");
    return structuredClone(this.lastReport);
  }
  async latestReport() {
    return this.store.latest();
  }
  async importEvidence(input) {
    if (input instanceof Blob && input.size > 5 * 1024 * 1024) {
      throw new Error("Native evidence JSON exceeds the 5 MB local limit.");
    }
    const evidence = input instanceof Blob ? JSON.parse(await input.text()) : structuredClone(input);
    const allowed = /* @__PURE__ */ new Set(["F3-native-vulkan", "F4-native-openxr", "F5-arm64-flatpak", "F6-device"]);
    if (evidence.simulated !== false || !allowed.has(evidence.evidenceLevel)) {
      throw new Error("Imported native evidence must be explicitly non-simulated and labeled F3 through F6.");
    }
    if (!evidence.producer || !evidence.scenario || !evidence.generatedAt) {
      throw new Error("Imported native evidence is missing producer, scenario, or generatedAt metadata.");
    }
    this.importedEvidence = evidence;
    await this.store.saveNative(evidence);
    this.emit("frameulator-evidence", evidence);
    return structuredClone(evidence);
  }
  async latestNativeEvidence() {
    this.importedEvidence ??= await this.store.latestNative();
    return this.importedEvidence ? structuredClone(this.importedEvidence) : void 0;
  }
  compareEvidence(options) {
    const native = options.native ?? this.importedEvidence;
    if (!native) throw new Error("Import or supply native evidence before comparison.");
    const sameScenario = options.simulation.scenario === native.scenario;
    return {
      comparable: sameScenario,
      sameScenario,
      simulationPassed: options.simulation.passed,
      nativePassed: native.passed,
      simulationLevel: "F1-browser-wasm",
      nativeLevel: native.evidenceLevel,
      note: sameScenario ? "Results share a scenario id; native evidence remains authoritative for native execution." : "Scenario ids differ, so pass/fail outcomes are not directly comparable."
    };
  }
  async destroy() {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    this.renderer?.destroy();
    this.transport.destroy();
    this.store.close();
    this.importedEvidence = void 0;
    this.lastReport = void 0;
  }
  tick = async (time) => {
    if (!this.running) return;
    if (!this.stepping) {
      this.stepping = true;
      try {
        const delta = Math.min(50, Math.max(0, time - this.previousTime));
        const snapshot = await this.transport.request("step", delta);
        this.previousTime = time;
        this.renderer?.update(snapshot);
        if (snapshot.applicationFrame?.management) this.updateManagement(snapshot.applicationFrame.management);
        this.emit("frameulator-frame", snapshot);
        this.emit("frameulator-state", { state: snapshot.sessionState });
      } catch (error) {
        this.emit("frameulator-error", { message: error instanceof Error ? error.message : String(error) });
        this.running = false;
      } finally {
        this.stepping = false;
      }
    }
    if (this.running) this.frameRequest = requestAnimationFrame(this.tick);
  };
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  requireApplication() {
    if (!this.applicationGate.verification?.accepted || !["READY", "STOPPED", "RUNNING"].includes(this.applicationGate.state)) {
      throw new Error("FLATPAK_REQUIRED: select an approved Agora Flatpak before starting a session.");
    }
  }
  applicationEvidence(snapshot) {
    const release = this.applicationGate.verification?.release;
    if (!release) throw new Error("The verified Agora release is unavailable.");
    return {
      flatpakUploaded: true,
      flatpakHashVerified: true,
      matchingAgoraCodeExecuted: Boolean(snapshot?.stereoContractValid && snapshot.frameCount > 0),
      executionMode: "browser-wasm-capsule",
      nativeFlatpakInstalled: false,
      nativeFlatpakExecuted: false,
      hardwareSimulated: true,
      appId: release.appId,
      version: release.version,
      architecture: release.architecture,
      sourceCommit: release.sourceCommit,
      flatpakSha256: release.flatpakSha256,
      browserWasmSha256: release.browserWasmSha256,
      capsuleAbi: release.capsuleAbi,
      managementProtocol: release.managementProtocol
    };
  }
  managementEvidence(snapshot) {
    if (!snapshot) throw new Error("Agora management evidence is unavailable.");
    return {
      protocol: "agora-management/2",
      simulatedDeployment: true,
      nativeDeployment: false,
      snapshot: structuredClone(snapshot.management)
    };
  }
  async runManagementCommand(command, value) {
    const snapshot = await this.transport.request("managementCommand", { command, value });
    this.renderer?.update(snapshot);
    this.updateManagement(snapshot.applicationFrame.management);
    return structuredClone(snapshot.applicationFrame.management);
  }
  updateManagement(snapshot) {
    this.currentManagement = structuredClone(snapshot);
    this.emit("frameulator-management", this.currentManagement);
    this.emit("frameulator-device", { state: snapshot.deviceState });
    this.emit("frameulator-deployment", { state: snapshot.deploymentState });
    this.emit("frameulator-session", { state: snapshot.applicationSessionState });
    this.emit("frameulator-log", snapshot.events.at(-1) ?? { kind: snapshot.lastEvent });
  }
};

// packages/frameulator/src/styles.css
var styles_default = ':host {\n  --bg: #050708;\n  --panel: #0a0f11;\n  --panel-2: #0d1416;\n  --line: rgba(172, 242, 231, 0.14);\n  --line-strong: rgba(172, 242, 231, 0.28);\n  --mint: #69e2d0;\n  --orange: #ff7548;\n  --red: #ff6b6b;\n  --text: #eef8f5;\n  --muted: #8fa6a3;\n  display: block;\n  width: 100%;\n  height: 100%;\n  min-width: 320px;\n  min-height: 0;\n  color: var(--text);\n  background: var(--bg);\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n}\n\n* { box-sizing: border-box; }\nbutton, progress { font: inherit; }\nbutton { min-height: 44px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--text); background: #11191b; cursor: pointer; }\nbutton:hover:not(:disabled) { border-color: rgba(105, 226, 208, 0.65); background: #172224; }\nbutton:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }\nbutton:disabled { opacity: 0.36; cursor: not-allowed; }\nbutton.primary { color: #04110f; border-color: var(--mint); background: var(--mint); font-weight: 750; }\nbutton.primary:hover:not(:disabled) { background: #8ff3e5; }\nbutton.danger { color: #ffc3b1; border-color: rgba(255, 117, 72, 0.35); background: rgba(255, 117, 72, 0.08); }\n\n.frameulator-shell {\n  position: relative;\n  width: 100%;\n  height: 100%;\n  min-height: 520px;\n  display: grid;\n  grid-template:\n    "topbar topbar topbar" 54px\n    "rail stage inspector" minmax(0, 1fr)\n    "status status status" 34px\n    / 214px minmax(0, 1fr) 344px;\n  overflow: hidden;\n  background: var(--bg);\n}\n\n.frameulator-topbar {\n  grid-area: topbar;\n  z-index: 6;\n  display: flex;\n  align-items: center;\n  gap: 18px;\n  min-width: 0;\n  padding: 0 12px;\n  border-bottom: 1px solid var(--line);\n  background: rgba(8, 12, 13, 0.98);\n}\n\n.frameulator-brand { display: flex; align-items: center; gap: 9px; min-width: 170px; }\n.frameulator-brand strong { font-size: 15px; letter-spacing: 0.02em; }\n.frameulator-brand > span:last-child { color: var(--muted); font: 12px ui-monospace, monospace; }\n.frameulator-mark {\n  width: 25px;\n  height: 25px;\n  flex: none;\n  border: 1px solid rgba(105, 226, 208, 0.55);\n  border-radius: 50%;\n  background: radial-gradient(circle at 36% 32%, #c6fff7 0 6%, #4ecfbe 7% 20%, #0b2828 21% 58%, #ff7548 59% 66%, transparent 67%);\n  box-shadow: 0 0 18px rgba(73, 215, 198, 0.22);\n}\n.frameulator-context { display: flex; align-self: stretch; min-width: 0; border-left: 1px solid var(--line); }\n.frameulator-context > span { min-width: 128px; display: grid; align-content: center; gap: 2px; padding: 0 14px; border-right: 1px solid var(--line); }\n.frameulator-context small, .frameulator-inspector header small { color: #68817d; font: 650 10px ui-monospace, monospace; letter-spacing: 0.09em; }\n.frameulator-context strong { overflow: hidden; color: #b8c9c6; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }\n.frameulator-global-actions { display: flex; gap: 7px; margin-left: auto; }\n.frameulator-global-actions button { min-height: 44px; padding: 0 13px; font-size: 13px; }\n.inspector-toggle { display: none; }\n\n.frameulator-rail { grid-area: rail; z-index: 3; min-height: 0; padding: 10px 8px; border-right: 1px solid var(--line); background: #070b0c; overflow-y: auto; }\n.frameulator-rail button { position: relative; width: 100%; min-height: 51px; display: grid; grid-template-columns: 28px 1fr 8px; align-items: center; gap: 8px; padding: 0 11px; border-color: transparent; color: var(--muted); background: transparent; text-align: left; text-transform: capitalize; }\n.frameulator-rail button:hover { background: #0d1416; }\n.frameulator-rail button[aria-current="page"] { color: var(--text); border-color: var(--line); background: #101719; }\n.frameulator-rail button[aria-current="page"]::before { content: ""; position: absolute; left: -9px; top: 9px; bottom: 9px; width: 2px; background: var(--mint); box-shadow: 0 0 12px var(--mint); }\n.rail-index { color: #54706c; font: 11px ui-monospace, monospace; }\n.rail-label { font-size: 14px; font-weight: 650; }\n.frameulator-rail i { width: 7px; height: 7px; overflow: hidden; border-radius: 50%; background: #34413f; font-size: 0; }\n.frameulator-rail i:not(:empty) { background: var(--mint); box-shadow: 0 0 8px rgba(105, 226, 208, 0.45); }\n\n.frameulator-stage { grid-area: stage; position: relative; min-width: 0; min-height: 0; overflow: hidden; background: #030506; }\n.frameulator-stage > canvas { display: block; width: 100%; height: 100%; }\n.frameulator-viewport-hud { pointer-events: none; position: absolute; z-index: 2; top: 12px; left: 12px; display: flex; gap: 7px; }\n.frameulator-viewport-hud span { padding: 6px 8px; border: 1px solid var(--line); border-radius: 5px; color: #aec4c0; background: rgba(5, 8, 9, 0.78); font: 650 10px ui-monospace, monospace; letter-spacing: 0.04em; backdrop-filter: blur(8px); }\n\n.frameulator-upload { position: absolute; z-index: 4; inset: 50% auto auto 50%; width: min(470px, calc(100% - 32px)); padding: 28px; transform: translate(-50%, -50%); border: 1px dashed rgba(105, 226, 208, 0.5); border-radius: 12px; background: rgba(6, 10, 11, 0.93); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.58); text-align: center; backdrop-filter: blur(15px); }\n.frameulator-upload[hidden] { display: none; }\n.frameulator-upload[data-dragging="true"] { border-color: var(--orange); background: rgba(28, 15, 12, 0.95); }\n.frameulator-upload strong { display: block; margin: 6px 0 9px; font-size: clamp(24px, 4vw, 36px); letter-spacing: -0.035em; }\n.frameulator-upload p:not(.frameulator-kicker) { max-width: 390px; margin: 0 auto 18px; color: var(--muted); font-size: 15px; line-height: 1.55; }\n.frameulator-upload button { min-width: 154px; min-height: 44px; padding: 0 18px; }\n.frameulator-upload progress { width: 100%; height: 6px; margin-top: 18px; accent-color: var(--mint); }\n.frameulator-upload [data-upload-detail] { display: block; margin-top: 14px; color: #91a8a4; font-size: 13px; line-height: 1.45; }\n.frameulator-kicker { margin: 0; color: var(--orange); font: 700 11px ui-monospace, monospace; letter-spacing: 0.12em; }\n\n.frameulator-eye-dock { pointer-events: none; position: absolute; z-index: 2; right: 12px; bottom: 12px; display: flex; gap: 7px; }\n.frameulator-eye-dock figure { position: relative; width: 124px; height: 82px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 6px; background: #050708; }\n.frameulator-eye-dock canvas { width: 100%; height: 100%; display: block; }\n.frameulator-eye-dock figcaption { position: absolute; z-index: 1; top: 5px; left: 6px; color: #d9f9f3; font: 700 9px ui-monospace, monospace; }\n\n.frameulator-inspector { grid-area: inspector; z-index: 5; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto 42px minmax(0, 1fr); border-left: 1px solid var(--line); background: linear-gradient(180deg, #0c1315, #080c0d); }\n.frameulator-inspector > header { min-height: 69px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 15px; border-bottom: 1px solid var(--line); }\n.frameulator-inspector h2 { margin: 3px 0 0; font-size: 19px; font-weight: 680; letter-spacing: -0.02em; }\n.state-chip { max-width: 145px; padding: 6px 8px; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 999px; color: var(--mint); background: rgba(105, 226, 208, 0.06); font: 700 10px ui-monospace, monospace; text-overflow: ellipsis; }\n.frameulator-tabs { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid var(--line); }\n.frameulator-tabs button { min-height: 44px; padding: 0; border: 0; border-right: 1px solid var(--line); border-radius: 0; color: #718783; background: transparent; font-size: 12px; }\n.frameulator-tabs button[aria-selected="true"] { color: var(--text); box-shadow: inset 0 -2px var(--mint); }\n.frameulator-inspector-body { min-height: 0; overflow-y: auto; }\n.frameulator-inspector-body > section { padding: 14px; }\n.frameulator-inspector-body > section[hidden] { display: none; }\n\ndl { margin: 0; }\ndl div { min-height: 43px; display: grid; grid-template-columns: minmax(92px, 0.7fr) minmax(0, 1.3fr); align-items: center; gap: 12px; border-bottom: 1px solid rgba(172, 242, 231, 0.09); }\ndt { color: #728a86; font-size: 13px; }\ndd { margin: 0; overflow: hidden; color: #d6e4e1; font: 650 12px ui-monospace, monospace; text-align: right; text-overflow: ellipsis; white-space: nowrap; }\n.hash-line, .boundary-note { margin: 14px 0; padding: 11px; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: 6px; color: #849995; background: #080d0e; font: 12px/1.55 ui-monospace, monospace; }\n.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }\n.action-stack { display: grid; gap: 7px; margin-top: 14px; }\n.action-stack button, .action-grid button { min-height: 44px; padding: 0 12px; }\n.event-timeline { max-height: 150px; margin: 14px 0; padding: 0; overflow: auto; border: 1px solid var(--line); border-radius: 6px; list-style: none; }\n.event-timeline li { min-height: 34px; display: flex; align-items: center; gap: 10px; padding: 0 9px; border-bottom: 1px solid var(--line); color: #9db0ad; font: 11px ui-monospace, monospace; }\n.event-timeline li:last-child { border-bottom: 0; }\n.event-timeline span { color: var(--orange); }\n\n.frameulator-services { display: grid; gap: 8px; }\n.frameulator-services article { padding: 11px; border: 1px solid var(--line); border-radius: 7px; background: rgba(255, 255, 255, 0.014); }\n.frameulator-services article div { display: flex; justify-content: space-between; gap: 10px; }\n.frameulator-services strong { font-size: 14px; text-transform: capitalize; }\n.frameulator-services span { color: var(--mint); font: 700 10px ui-monospace, monospace; text-transform: uppercase; }\n.frameulator-services p { margin: 7px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }\n.frameulator-logs { min-height: 260px; margin: 0; color: #aac0bc; font: 12px/1.65 ui-monospace, monospace; white-space: pre-wrap; }\n.proof-stack { display: grid; gap: 9px; }\n.proof-stack article { display: grid; gap: 5px; padding: 13px; border: 1px solid var(--line); border-radius: 7px; background: #090e10; }\n.proof-stack span, .proof-stack small { color: var(--muted); font-size: 12px; }\n.proof-stack strong { font-size: 15px; }\n.scenario-list { display: grid; gap: 8px; }\n.scenario-list button { min-height: 72px; display: grid; grid-template-columns: 28px 1fr; grid-template-rows: auto auto; align-content: center; column-gap: 9px; padding: 10px; text-align: left; }\n.scenario-list button > span { grid-row: 1 / -1; align-self: center; color: var(--orange); font: 700 11px ui-monospace, monospace; }\n.scenario-list button strong { font-size: 13px; }\n.scenario-list button small { color: var(--muted); font-size: 11px; }\n.scenario-list article { min-height: 72px; display: grid; grid-template-columns: 50px 1fr; grid-template-rows: auto auto; align-content: center; column-gap: 9px; padding: 10px; border: 1px solid var(--line); border-radius: 7px; }\n.scenario-list article > span { grid-row: 1 / -1; align-self: center; color: var(--orange); font: 700 10px ui-monospace, monospace; }\n.scenario-list article strong { font-size: 13px; }\n.scenario-list article small { color: var(--muted); font-size: 11px; }\n\n.frameulator-statusbar { grid-area: status; z-index: 7; display: flex; align-items: center; gap: 9px; min-width: 0; padding: 0 11px; border-top: 1px solid var(--line); color: #708581; background: #070a0b; font: 10px ui-monospace, monospace; letter-spacing: 0.03em; }\n.frameulator-statusbar span:nth-child(2) { overflow: hidden; color: #a8bdb9; text-overflow: ellipsis; white-space: nowrap; }\n.frameulator-statusbar span:nth-last-child(2) { margin-left: auto; }\n.status-light { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #4b5553; }\n.status-light[data-state="ready"] { background: var(--mint); box-shadow: 0 0 8px rgba(105, 226, 208, 0.55); }\n.status-light[data-state="running"] { background: var(--orange); box-shadow: 0 0 8px rgba(255, 117, 72, 0.55); }\n\n@media (max-width: 1100px) {\n  .frameulator-shell { grid-template-columns: 68px minmax(0, 1fr) 306px; }\n  .frameulator-brand { min-width: 138px; }\n  .frameulator-context > span { min-width: 108px; padding-inline: 10px; }\n  .frameulator-context > span:nth-child(3) { display: none; }\n  .frameulator-rail button { grid-template-columns: 1fr 8px; justify-items: center; padding: 0 8px; }\n  .rail-label { display: none; }\n  .rail-index { font-size: 12px; }\n}\n\n@media (max-width: 820px) {\n  .frameulator-shell {\n    grid-template:\n      "topbar topbar" 54px\n      "rail stage" minmax(0, 1fr)\n      "status status" 34px\n      / 58px minmax(0, 1fr);\n  }\n  .frameulator-context { display: none; }\n  .frameulator-brand { min-width: 0; }\n  .inspector-toggle { display: inline-flex; align-items: center; }\n  .frameulator-inspector { position: absolute; top: 54px; right: 0; bottom: 34px; width: min(360px, calc(100% - 58px)); transition: transform 160ms ease; box-shadow: -20px 0 45px rgba(0,0,0,0.4); }\n  .frameulator-inspector[data-open="false"] { transform: translateX(100%); }\n  .frameulator-eye-dock figure { width: 100px; height: 66px; }\n}\n\n@media (max-width: 560px) {\n  .frameulator-brand strong,\n  .frameulator-brand > span:last-child { display: none; }\n  .frameulator-global-actions button { padding-inline: 9px; font-size: 12px; }\n  .frameulator-global-actions [data-action="stop"] { display: none; }\n  .frameulator-eye-dock { right: 7px; bottom: 7px; }\n  .frameulator-eye-dock figure { width: 84px; height: 58px; }\n  .frameulator-upload { padding: 22px 17px; }\n  .frameulator-statusbar span:last-child { display: none; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .frameulator-inspector { transition: none; }\n}\n';

// packages/frameulator/src/storage/WorkspaceStore.ts
var WorkspaceStore = class {
  constructor(key = "frameulator-workbench-v1") {
    this.key = key;
  }
  load() {
    try {
      const value = globalThis.localStorage?.getItem(this.key);
      if (!value) return void 0;
      const parsed = JSON.parse(value);
      const allowed = /* @__PURE__ */ new Set(["package", "device", "deploy", "session", "tests", "evidence"]);
      if (parsed.schemaVersion !== 1 || !parsed.lastSection || !allowed.has(parsed.lastSection)) return void 0;
      return { schemaVersion: 1, lastSection: parsed.lastSection };
    } catch {
      return void 0;
    }
  }
  save(lastSection) {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify({ schemaVersion: 1, lastSection }));
    } catch {
    }
  }
  clear() {
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
    }
  }
};

// packages/frameulator/src/element/frameulator-element.ts
var HTMLElementBase = globalThis.HTMLElement ?? class {
};
var serviceOrder = [
  "hardware",
  "gpu",
  "vulkan",
  "openxr",
  "compositor",
  "firmware",
  "tracking",
  "controllers",
  "host"
];
var sections = ["package", "device", "deploy", "session", "tests", "evidence"];
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] ?? character);
}
var emptyManagement = {
  protocol: "agora-management/2",
  deviceState: "OFFLINE",
  deploymentState: "ABSENT",
  applicationSessionState: "IDLE",
  testState: "NOT_RUN",
  projectState: "EMPTY",
  currentRelease: 0,
  previousRelease: 0,
  eventCount: 0,
  lastEvent: "RESET",
  events: []
};
var FrameulatorElement = class extends HTMLElementBase {
  lab;
  initialized = false;
  applicationState = "EMPTY";
  management = structuredClone(emptyManagement);
  verification;
  activeSection = "package";
  services;
  logEntries = [];
  lastReport;
  workspace = new WorkspaceStore();
  gamepadFrame = 0;
  gamepadButtons = /* @__PURE__ */ new Set();
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.mount().catch((error) => this.showError(error));
  }
  disconnectedCallback() {
    this.ownerDocument.removeEventListener("keydown", this.handleKeyDown);
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.gamepadFrame);
    this.lab?.destroy().catch(() => void 0);
    this.lab = void 0;
    this.initialized = false;
  }
  async mount() {
    this.activeSection = this.workspace.load()?.lastSection ?? "package";
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${styles_default}</style>
      <section class="frameulator-shell" aria-label="Frameulator Agora operator workbench">
        <header class="frameulator-topbar">
          <div class="frameulator-brand"><span class="frameulator-mark" aria-hidden="true"></span><strong>Frameulator</strong><span>0.2.0</span></div>
          <div class="frameulator-context" aria-label="Current target">
            <span><small>PACKAGE</small><strong data-top-package>None</strong></span>
            <span><small>DEVICE</small><strong data-top-device>Offline</strong></span>
            <span><small>PROOF</small><strong>F1/F2 simulation</strong></span>
          </div>
          <div class="frameulator-global-actions">
            <button type="button" data-action="select">Open Flatpak</button>
            <button type="button" class="primary" data-action="run" data-workbench-action="normal" disabled>Run test</button>
            <button type="button" class="danger" data-action="stop" data-workbench-action="stop" disabled>Stop</button>
            <button type="button" class="inspector-toggle" data-action="toggle-inspector" aria-label="Toggle inspector">Inspect</button>
          </div>
          <input type="file" accept=".flatpak,application/vnd.flatpak" data-flatpak hidden />
          <input type="file" accept=".json,.frameproof.json,application/json" data-evidence hidden />
        </header>

        <nav class="frameulator-rail" aria-label="Workbench sections">
          ${sections.map((section, index) => `
            <button type="button" data-section="${section}" ${section === this.activeSection ? 'aria-current="page"' : ""}>
              <span class="rail-index">0${index + 1}</span><span class="rail-label">${section}</span><i data-section-state="${section}"></i>
            </button>
          `).join("")}
        </nav>

        <main class="frameulator-stage" aria-label="Three-dimensional Steam Frame simulation">
          <div class="frameulator-viewport-hud">
            <span data-hud-session>SESSION \xB7 IDLE</span>
            <span data-hud-frames>0 FRAMES</span>
          </div>
          <div class="frameulator-upload" data-upload-state="EMPTY">
            <p class="frameulator-kicker">APPLICATION REQUIRED</p>
            <strong>Open Agora.flatpak</strong>
            <p>Verify an approved release locally, then rehearse it against the simulated Steam Frame.</p>
            <button type="button" class="primary" data-action="select">Select Flatpak</button>
            <progress value="0" max="1" hidden></progress>
            <span data-upload-detail>The file stays on this device. It is not uploaded.</span>
          </div>
          <div class="frameulator-eye-dock" aria-label="Stereo eye previews">
            <figure><figcaption>LEFT</figcaption><canvas width="180" height="132" data-eye="left" aria-label="Left eye preview"></canvas></figure>
            <figure><figcaption>RIGHT</figcaption><canvas width="180" height="132" data-eye="right" aria-label="Right eye preview"></canvas></figure>
          </div>
        </main>

        <aside class="frameulator-inspector" data-open="true" aria-label="Workbench inspector">
          <header><div><small>INSPECTOR</small><h2 data-inspector-title>Package</h2></div><span class="state-chip" data-inspector-state>EMPTY</span></header>
          <div class="frameulator-tabs" role="tablist" aria-label="Inspector views">
            <button type="button" role="tab" aria-selected="true" data-tab="inspect">Inspect</button>
            <button type="button" role="tab" aria-selected="false" data-tab="services">Services</button>
            <button type="button" role="tab" aria-selected="false" data-tab="logs">Logs</button>
            <button type="button" role="tab" aria-selected="false" data-tab="proof">Proof</button>
          </div>
          <div class="frameulator-inspector-body">
            <section role="tabpanel" data-panel="inspect">
              <div data-section-content></div>
            </section>
            <section role="tabpanel" data-panel="services" hidden>
              <div class="frameulator-services" aria-label="Simulated service status"></div>
            </section>
            <section role="tabpanel" data-panel="logs" hidden>
              <div class="frameulator-logs" role="log" aria-live="polite"></div>
            </section>
            <section role="tabpanel" data-panel="proof" hidden>
              <div class="proof-stack">
                <article data-proof-browser><span>Browser contract</span><strong>Waiting for a run</strong><small>F1/F2 \xB7 simulated</small></article>
                <article data-proof-native><span>Native Flatpak smoke</span><strong>Not imported</strong><small>Separate CI evidence</small></article>
                <article><span>Native Vulkan</span><strong>Not tested</strong><small>F3 required</small></article>
                <article><span>Native OpenXR</span><strong>Not tested</strong><small>F4 required</small></article>
                <article><span>ARM64 Flatpak</span><strong>Not tested</strong><small>F5 required</small></article>
                <article><span>Physical Frame</span><strong>Not tested</strong><small>F6 required</small></article>
              </div>
            </section>
          </div>
        </aside>

        <footer class="frameulator-statusbar">
          <span class="status-light" data-status-light></span>
          <span data-status role="status" aria-live="polite">Flatpak required</span>
          <span data-last-event>RESET</span>
          <span>LOCAL \xB7 NETWORK DISABLED</span>
        </footer>
      </section>
    `;
    const stage = root.querySelector(".frameulator-stage");
    const left = root.querySelector('[data-eye="left"]');
    const right = root.querySelector('[data-eye="right"]');
    if (!stage || !left || !right) throw new Error("Unable to create the Frameulator workbench.");
    const keyId = this.getAttribute("trusted-key-id");
    const publicKeyBase64 = this.getAttribute("trusted-public-key");
    const trustedReleaseKeys = keyId && publicKeyBase64 ? [{ id: keyId, algorithm: "Ed25519", publicKeyBase64 }] : [];
    const registry = this.getAttribute("release-registry") || void 0;
    this.lab = await Frameulator.create({
      container: stage,
      profile: "steam-frame",
      renderer: "auto",
      storage: "indexeddb",
      network: "disabled",
      worker: "inline",
      releaseRegistry: registry,
      trustedReleaseKeys
    });
    this.lab.setEyePreviews(left, right);
    if (this.getAttribute("release-configured") === "false") {
      this.setText("[data-upload-detail]", "No signed Agora 0.0.2 release is published yet. The Flatpak gate remains locked.");
      this.setText("[data-status]", "Flatpak required \xB7 signed release registry unavailable");
    }
    this.forwardEvents();
    this.services = await this.lab.call("services.status");
    const previousReport = await this.lab.latestReport();
    if (previousReport) this.restoreReportSummary(previousReport);
    const previousNative = await this.lab.latestNativeEvidence();
    if (previousNative) this.restoreNativeSummary(previousNative);
    this.renderServices();
    this.bindControls();
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      this.gamepadFrame = requestAnimationFrame(this.pollGamepad);
    }
    const inspector = root.querySelector(".frameulator-inspector");
    if (inspector && matchMedia("(max-width: 820px)").matches) inspector.dataset.open = "false";
    this.renderSection();
    this.syncControls();
    this.dispatch("frameulator-ready", { version: this.lab.version, simulated: true, applicationState: "EMPTY" });
  }
  forwardEvents() {
    if (!this.lab) return;
    const forwarded = [
      "frameulator-frame",
      "frameulator-state",
      "frameulator-result",
      "frameulator-error",
      "frameulator-application",
      "frameulator-flatpak-verified",
      "frameulator-management",
      "frameulator-device",
      "frameulator-deployment",
      "frameulator-session",
      "frameulator-package",
      "frameulator-log",
      "frameulator-evidence"
    ];
    for (const type of forwarded) {
      this.lab.addEventListener(type, ((event) => {
        if (type === "frameulator-application") this.setApplicationState(event.detail.state, event.detail.detail, event.detail.progress);
        if (type === "frameulator-management") this.setManagement(event.detail);
        if (type === "frameulator-frame") this.updateFrameHud(event.detail.applicationFrame);
        if (type === "frameulator-result") this.showReport(event.detail);
        this.dispatch(type, event.detail);
      }));
    }
  }
  bindControls() {
    const root = this.shadowRoot;
    const input = root?.querySelector("[data-flatpak]");
    const evidenceInput = root?.querySelector("[data-evidence]");
    const upload = root?.querySelector(".frameulator-upload");
    root?.querySelectorAll('[data-action="select"]').forEach((button) => button.addEventListener("click", () => input?.click()));
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) this.selectFlatpak(file);
      input.value = "";
    });
    evidenceInput?.addEventListener("change", () => {
      const file = evidenceInput.files?.[0];
      if (file) this.importEvidence(file).catch((error) => this.showError(error));
      evidenceInput.value = "";
    });
    upload?.addEventListener("dragover", (event) => {
      event.preventDefault();
      upload.dataset.dragging = "true";
    });
    upload?.addEventListener("dragleave", () => {
      delete upload.dataset.dragging;
    });
    upload?.addEventListener("drop", (event) => {
      event.preventDefault();
      delete upload.dataset.dragging;
      const file = event.dataTransfer?.files[0];
      if (file) this.selectFlatpak(file);
    });
    root?.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => {
      this.selectSection(button.dataset.section);
    }));
    root?.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
      this.selectInspectorTab(button.dataset.tab ?? "inspect");
    }));
    root?.querySelector('[data-action="toggle-inspector"]')?.addEventListener("click", () => {
      const inspector = root.querySelector(".frameulator-inspector");
      if (inspector) inspector.dataset.open = String(inspector.dataset.open !== "true");
    });
    root?.addEventListener("click", (event) => this.handleAction(event));
    this.ownerDocument.addEventListener("keydown", this.handleKeyDown);
  }
  handleAction(event) {
    const target = event.target.closest("[data-workbench-action]");
    if (!target || target.matches(":disabled")) return;
    const action = target.dataset.workbenchAction;
    const operations = {
      select: async () => {
        this.shadowRoot?.querySelector("[data-flatpak]")?.click();
      },
      import: async () => {
        this.shadowRoot?.querySelector("[data-evidence]")?.click();
      },
      deploy: () => this.lab.rehearseDeploy(),
      launch: () => this.lab.start(),
      stop: () => this.lab.stop(),
      restart: () => this.lab.restartCapsule(),
      crash: () => this.lab.simulateCrash(),
      recover: () => this.lab.recoverCrash(),
      update: () => this.lab.simulateUpdate(this.management.currentRelease + 1),
      "failed-update": () => this.lab.simulateFailedUpdate(this.management.currentRelease + 1),
      rollback: () => this.lab.simulateRollback(),
      remove: () => this.removeApplication(),
      normal: () => this.runScenario("normal-session"),
      tracking: () => this.runScenario("tracking-recovery"),
      controller: () => this.pulseController(),
      loss: () => this.lab.injectEvent("tracking-lost"),
      restore: () => this.lab.injectEvent("tracking-restored"),
      export: () => this.downloadReport()
    };
    if (!action || !operations[action]) return;
    operations[action]().catch((error) => this.showError(error));
  }
  handleKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
      event.preventDefault();
      this.shadowRoot?.querySelector("[data-flatpak]")?.click();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (["READY", "RUNNING", "STOPPED"].includes(this.applicationState)) this.runScenario("normal-session").catch((error) => this.showError(error));
    }
    if (event.key === "Escape" && this.management.applicationSessionState === "RUNNING") {
      this.lab?.stop().catch((error) => this.showError(error));
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      this.moveFocus(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
      event.preventDefault();
    }
    const sectionIndex = Number(event.key) - 1;
    if (sectionIndex >= 0 && sectionIndex < sections.length && !event.metaKey && !event.ctrlKey) {
      this.selectSection(sections[sectionIndex]);
    }
  };
  pollGamepad = () => {
    const gamepad = Array.from(navigator.getGamepads()).find((candidate) => candidate?.connected);
    if (gamepad) {
      const pressed = new Set(gamepad.buttons.flatMap((button, index) => button.pressed ? [index] : []));
      if ([12, 14].some((index) => pressed.has(index) && !this.gamepadButtons.has(index))) this.moveFocus(-1);
      if ([13, 15].some((index) => pressed.has(index) && !this.gamepadButtons.has(index))) this.moveFocus(1);
      if (pressed.has(0) && !this.gamepadButtons.has(0)) {
        this.shadowRoot?.activeElement?.click();
      }
      this.gamepadButtons = pressed;
    } else {
      this.gamepadButtons.clear();
    }
    this.gamepadFrame = requestAnimationFrame(this.pollGamepad);
  };
  moveFocus(direction) {
    const controls = Array.from(this.shadowRoot?.querySelectorAll("button:not(:disabled)") ?? []);
    if (controls.length === 0) return;
    const current = controls.indexOf(this.shadowRoot?.activeElement);
    controls[(current + direction + controls.length) % controls.length]?.focus();
  }
  selectSection(section) {
    this.activeSection = section;
    this.workspace.save(section);
    this.shadowRoot?.querySelectorAll("[data-section]").forEach((button) => {
      if (button.dataset.section === section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const inspector = this.shadowRoot?.querySelector(".frameulator-inspector");
    if (inspector && matchMedia("(max-width: 820px)").matches) inspector.dataset.open = "true";
    this.selectInspectorTab("inspect");
    this.renderSection();
  }
  selectInspectorTab(tab) {
    this.shadowRoot?.querySelectorAll("[data-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    });
    this.shadowRoot?.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
  }
  renderSection() {
    const title = this.shadowRoot?.querySelector("[data-inspector-title]");
    const state = this.shadowRoot?.querySelector("[data-inspector-state]");
    const content = this.shadowRoot?.querySelector("[data-section-content]");
    if (!title || !state || !content) return;
    title.textContent = this.activeSection[0].toUpperCase() + this.activeSection.slice(1);
    const release = this.verification?.release;
    const rows = (items) => `<dl>${items.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
    const button = (label, action, kind = "") => `<button type="button" class="${kind}" data-workbench-action="${action}">${label}</button>`;
    if (this.activeSection === "package") {
      state.textContent = this.applicationState;
      content.innerHTML = `${rows([
        ["File", this.verification?.fileName ?? "No Flatpak selected"],
        ["Size", this.verification ? `${(this.verification.size / 1048576).toFixed(2)} MB` : "\u2014"],
        ["Version", release?.version ?? "\u2014"],
        ["Architecture", release?.architecture ?? "\u2014"],
        ["Source", release?.sourceCommit ?? "\u2014"],
        ["Signature", release ? this.getAttribute("trusted-key-id") ?? "Verified Ed25519 registry" : "\u2014"],
        ["Capsule", release?.browserWasmSha256 ?? "\u2014"],
        ["Project", this.management.projectState],
        ["Capsule ABI", release ? String(release.capsuleAbi) : "\u2014"]
      ])}<p class="hash-line">${escapeHtml(this.verification?.flatpakSha256 ?? "Select an approved Agora release to unlock the workbench.")}</p><div class="action-grid">${button("Open Flatpak", "select", "primary")} ${button("Remove", "remove")}</div>`;
    } else if (this.activeSection === "device") {
      state.textContent = this.management.deviceState;
      content.innerHTML = `${rows([
        ["Target", "Steam Frame"],
        ["Architecture", "ARM64 contract"],
        ["Memory", `${SteamFrameProfile.hardware.memoryMiB} MiB contract`],
        ["GPU", "Adreno contract"],
        ["OpenXR", "1.1 simulated"],
        ["Tracking", this.management.applicationSessionState === "CRASHED" ? "Unavailable" : "Available"]
      ])}<p class="boundary-note">Hardware, firmware, GPU drivers, and SteamVR are simulated in this browser.</p>`;
    } else if (this.activeSection === "deploy") {
      state.textContent = this.management.deploymentState;
      content.innerHTML = `${rows([
        ["Current", this.management.currentRelease ? `Generation ${this.management.currentRelease}` : "None"],
        ["Previous", this.management.previousRelease ? `Generation ${this.management.previousRelease}` : "None"],
        ["Policy", this.management.deviceState === "AVAILABLE" ? "Ready" : "Blocked"],
        ["Mode", "Deployment rehearsal"]
      ])}<ol class="event-timeline">${this.management.events.slice(-6).map((event) => `<li><span>${event.sequence}</span>${escapeHtml(event.kind)}</li>`).join("") || "<li>No deployment events</li>"}</ol><div class="action-stack">${button("Rehearse deploy", "deploy", "primary")} ${button("Simulate update", "update")} ${button("Fail update + recover", "failed-update")} ${button("Rollback", "rollback")}</div>`;
    } else if (this.activeSection === "session") {
      state.textContent = this.management.applicationSessionState;
      content.innerHTML = `${rows([
        ["Application", this.management.applicationSessionState],
        ["OpenXR", this.readHud("[data-hud-session]")],
        ["Frames", this.readHud("[data-hud-frames]")],
        ["Last event", this.management.lastEvent]
      ])}<div class="action-stack">${button("Launch capsule", "launch", "primary")} ${button("Stop", "stop")} ${button("Restart capsule", "restart")} ${button("Simulate crash", "crash", "danger")} ${button("Recover", "recover")} ${button("Lose tracking", "loss")} ${button("Restore tracking", "restore")}</div>`;
    } else if (this.activeSection === "tests") {
      state.textContent = this.management.testState;
      content.innerHTML = `<div class="scenario-list"><button type="button" data-workbench-action="normal"><span>01</span><strong>Managed normal session</strong><small>Verify, deploy, launch, focus, render</small></button><button type="button" data-workbench-action="tracking"><span>02</span><strong>Tracking recovery</strong><small>Lose tracking and return to focused</small></button><button type="button" data-workbench-action="controller"><span>03</span><strong>Controller action</strong><small>Drive the visible right controller from the input bridge</small></button><article><span>04\u201312</span><strong>Policy and evidence suite</strong><small>Invalid package, crash, update, rollback, persistence, cleanup, and native comparison run through API and CI checks.</small></article></div>`;
    } else {
      state.textContent = this.lastReport?.passed ? "PASSED" : "NOT RUN";
      content.innerHTML = `${rows([
        ["Browser", this.lastReport ? this.lastReport.passed ? "Passed" : "Failed" : "Not run"],
        ["Level", "F1/F2"],
        ["Native install", "Not executed here"],
        ["Physical device", "Not tested"]
      ])}<div class="action-stack">${button("Import native evidence", "import")} ${button("Export frameproof", "export", "primary")}</div>`;
    }
    this.syncControls();
  }
  renderServices() {
    const container = this.shadowRoot?.querySelector(".frameulator-services");
    if (!this.services || !container) return;
    container.innerHTML = serviceOrder.map((name) => `<article><div><strong>${name}</strong><span>${this.services[name].status}</span></div><p>${this.services[name].detail}</p></article>`).join("");
  }
  selectFlatpak(file) {
    this.appendLog(`Selected ${file.name} \xB7 ${Math.ceil(file.size / 1024)} KB`);
    this.lab?.selectFlatpak(file).then((verification) => {
      this.verification = verification;
      this.appendLog(`Verified ${verification.release?.version} \xB7 capsule ABI ${verification.release?.capsuleAbi}`);
      this.renderSection();
    }).catch((error) => this.showError(error));
  }
  setApplicationState(state, detail, progress) {
    this.applicationState = state;
    const upload = this.shadowRoot?.querySelector(".frameulator-upload");
    const detailElement = this.shadowRoot?.querySelector("[data-upload-detail]");
    const progressElement = this.shadowRoot?.querySelector("progress");
    if (upload) {
      upload.dataset.uploadState = state;
      upload.hidden = ["READY", "RUNNING", "STOPPED"].includes(state);
    }
    if (detailElement) detailElement.textContent = detail;
    if (progressElement) {
      progressElement.hidden = state !== "HASHING";
      progressElement.value = progress ?? 0;
    }
    this.setText("[data-status]", detail);
    this.appendLog(`${state} \xB7 ${detail}`);
    this.renderSection();
  }
  setManagement(snapshot) {
    this.management = structuredClone(snapshot);
    this.setText("[data-top-device]", snapshot.deviceState);
    this.setText("[data-top-package]", this.verification?.release ? `Agora ${this.verification.release.version}` : "Verified Agora");
    this.setText("[data-last-event]", snapshot.lastEvent);
    this.appendLog(`${snapshot.lastEvent} \xB7 ${snapshot.deploymentState} \xB7 ${snapshot.applicationSessionState}`);
    this.renderSection();
  }
  updateFrameHud(snapshot) {
    if (!snapshot) return;
    this.setText("[data-hud-session]", `SESSION \xB7 ${snapshot.sessionState ?? "IDLE"}`);
    this.setText("[data-hud-frames]", `${snapshot.frameCount ?? 0} FRAMES`);
    if (this.activeSection === "session") this.renderSection();
  }
  syncControls() {
    const verified = ["READY", "RUNNING", "STOPPED"].includes(this.applicationState);
    const deployed = this.management.deploymentState === "DEPLOYED";
    const running = this.management.applicationSessionState === "RUNNING";
    this.setDisabled("run", !verified);
    this.setDisabled("stop", !running);
    this.setWorkbenchDisabled("deploy", !verified || this.management.deploymentState !== "ABSENT");
    this.setWorkbenchDisabled("launch", !deployed || this.management.applicationSessionState !== "IDLE");
    this.setWorkbenchDisabled("stop", !running);
    this.setWorkbenchDisabled("restart", !verified || !deployed || !["IDLE", "RUNNING", "CRASHED"].includes(this.management.applicationSessionState));
    this.setWorkbenchDisabled("crash", !running);
    this.setWorkbenchDisabled("recover", this.management.applicationSessionState !== "CRASHED");
    this.setWorkbenchDisabled("update", !verified || !deployed || this.management.applicationSessionState !== "IDLE");
    this.setWorkbenchDisabled("failed-update", !verified || !deployed || this.management.applicationSessionState !== "IDLE");
    this.setWorkbenchDisabled("rollback", !verified || !deployed || this.management.previousRelease === 0);
    this.setWorkbenchDisabled("remove", !verified);
    this.setWorkbenchDisabled("normal", !verified);
    this.setWorkbenchDisabled("tracking", !verified);
    this.setWorkbenchDisabled("controller", !verified);
    this.setWorkbenchDisabled("loss", !running);
    this.setWorkbenchDisabled("restore", !running);
    this.setWorkbenchDisabled("export", !this.lastReport);
    this.setText("[data-section-state=package]", verified ? "ready" : "waiting");
    this.setText("[data-section-state=device]", this.management.deviceState.toLowerCase());
    this.setText("[data-section-state=deploy]", this.management.deploymentState.toLowerCase());
    this.setText("[data-section-state=session]", this.management.applicationSessionState.toLowerCase());
    this.setText("[data-section-state=tests]", this.management.testState.toLowerCase());
    this.setText("[data-section-state=evidence]", this.lastReport?.passed ? "passed" : "waiting");
    const light = this.shadowRoot?.querySelector("[data-status-light]");
    if (light) light.dataset.state = running ? "running" : verified ? "ready" : "waiting";
  }
  async runScenario(scenario) {
    if (!this.lab) return;
    this.appendLog(`Running ${scenario}`);
    await this.lab.runScenario(scenario);
  }
  async pulseController() {
    if (!this.lab) return;
    await this.lab.setControllerState("right", { trigger: 1, buttons: { primary: true } });
    this.appendLog("Controller \xB7 right primary pressed");
    await new Promise((resolve) => setTimeout(resolve, 180));
    await this.lab.setControllerState("right", { trigger: 0, buttons: { primary: false } });
  }
  async importEvidence(file) {
    const evidence = await this.lab?.importEvidence(file);
    if (!evidence) return;
    const proof = this.shadowRoot?.querySelector("[data-proof-native]");
    if (proof) proof.innerHTML = `<span>Native evidence</span><strong>${evidence.passed ? "Passed" : "Failed"}</strong><small>${escapeHtml(evidence.evidenceLevel)} \xB7 ${escapeHtml(evidence.producer)}</small>`;
    this.appendLog(`Imported ${evidence.evidenceLevel} evidence \xB7 ${evidence.scenario}`);
    this.selectInspectorTab("proof");
  }
  showReport(report) {
    this.lastReport = report;
    this.management = structuredClone(report.management.snapshot);
    this.setText("[data-status]", report.passed ? `${report.scenario} passed \xB7 ${report.frameCount} frames` : `${report.scenario} failed`);
    const proof = this.shadowRoot?.querySelector("[data-proof-browser]");
    if (proof) proof.innerHTML = `<span>Browser contract</span><strong>${report.passed ? "Passed" : "Failed"}</strong><small>F1/F2 \xB7 ${report.frameCount} frames \xB7 native execution false</small>`;
    this.appendLog(`${report.passed ? "PASS" : "FAIL"} \xB7 ${report.scenario} \xB7 ${report.frameCount} frames`);
    this.renderSection();
  }
  async removeApplication() {
    await this.lab?.removeApplication();
    this.verification = void 0;
    this.lastReport = void 0;
    this.management = structuredClone(emptyManagement);
    this.workspace.clear();
    this.setText("[data-top-package]", "None");
    this.setText("[data-top-device]", "Offline");
    this.appendLog("Application removed from the local workbench");
    this.renderSection();
  }
  restoreReportSummary(report) {
    this.lastReport = report;
    const proof = this.shadowRoot?.querySelector("[data-proof-browser]");
    if (proof) proof.innerHTML = `<span>Previous browser contract</span><strong>${report.passed ? "Passed" : "Failed"}</strong><small>Reselect the exact Flatpak before capsule access is restored.</small>`;
    this.setText("[data-status]", "Previous report restored \xB7 Flatpak must be selected again");
    this.appendLog(`Restored report metadata \xB7 ${report.scenario}`);
  }
  restoreNativeSummary(evidence) {
    const proof = this.shadowRoot?.querySelector("[data-proof-native]");
    if (proof) proof.innerHTML = `<span>Stored native evidence</span><strong>${evidence.passed ? "Passed" : "Failed"}</strong><small>${escapeHtml(evidence.evidenceLevel)} \xB7 ${escapeHtml(evidence.producer)}</small>`;
  }
  showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.setText("[data-status]", `Blocked \xB7 ${message}`);
    this.appendLog(`ERROR \xB7 ${message}`);
    this.dispatch("frameulator-error", { message });
  }
  async downloadReport() {
    if (!this.lab) return;
    const report = await this.lab.exportReport();
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `frameulator-${report.scenario}.frameproof.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  appendLog(message) {
    this.logEntries.push(`${(/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false })}  ${message}`);
    if (this.logEntries.length > 80) this.logEntries.shift();
    const logs = this.shadowRoot?.querySelector(".frameulator-logs");
    if (logs) {
      logs.textContent = this.logEntries.join("\n");
      logs.scrollTop = logs.scrollHeight;
    }
  }
  setDisabled(action, disabled) {
    this.shadowRoot?.querySelectorAll(`[data-action="${action}"]`).forEach((button) => {
      button.disabled = disabled;
    });
  }
  setWorkbenchDisabled(action, disabled) {
    this.shadowRoot?.querySelectorAll(`[data-workbench-action="${action}"]`).forEach((button) => {
      button.disabled = disabled;
    });
  }
  setText(selector, value) {
    const element = this.shadowRoot?.querySelector(selector);
    if (element) element.textContent = value;
  }
  readHud(selector) {
    return this.shadowRoot?.querySelector(selector)?.textContent ?? "\u2014";
  }
  dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
};
function defineFrameulatorElement(tagName = "frameulator-lab") {
  if (!("customElements" in globalThis)) return;
  if (!customElements.get(tagName)) customElements.define(tagName, FrameulatorElement);
}
export {
  DefaultScenarios,
  Frameulator,
  FrameulatorElement,
  FrameulatorKernel,
  IncrementalSha256,
  SteamFrameProfile,
  createScenario,
  defineFrameulatorElement,
  sha256Blob,
  sha256Bytes,
  verifyReleaseRegistry
};
//# sourceMappingURL=frameulator.js.map
