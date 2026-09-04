/* Frameulator 0.1.0 | MIT */

// packages/frameulator/src/profile.ts
var SteamFrameProfile = Object.freeze({
  id: "steam-frame",
  label: "Steam Frame browser contract",
  version: "0.1.0",
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
      return { state: world.firmwareState, version: "simulated-0.1.0", hardwareFirmware: false, simulated: true };
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
      schemaVersion: 1,
      frameulatorVersion: "0.1.0",
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
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({ color: 3656635, transparent: true, opacity: 0.65 })
    );
    portal.position.set(0, 1.45, -1.4);
    this.scene.add(portal);
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
      this.applicationCube.visible = true;
      this.applicationHalo.visible = true;
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
  async save(report) {
    this.report = structuredClone(report);
  }
  async latest() {
    return this.report ? structuredClone(this.report) : void 0;
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
      const blob = new Blob(['var v=Object.freeze({id:"steam-frame",label:"Steam Frame browser contract",version:"0.1.0",simulated:!0,evidenceLevel:"F1-browser-wasm",display:{eyeWidth:1440,eyeHeight:1440,refreshRatesHz:[72,90,120],defaultRefreshRateHz:72},hardware:{architecture:"aarch64",memoryMiB:16384},gpu:{vendor:"Qualcomm",family:"Adreno",driver:"simulated-contract",api:"Vulkan 1.3 contract"},openxr:{apiVersion:"1.1",runtime:"SteamVR contract model",viewConfiguration:"PRIMARY_STEREO"}});function b(t){if(t===void 0||t==="steam-frame")return v;if(!t.simulated||t.evidenceLevel!=="F1-browser-wasm")throw new Error("Browser profiles must be explicitly labeled simulated at F1-browser-wasm.");return t}var y=Object.freeze([{id:"normal-session",label:"Normal OpenXR session",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"assert-state",state:"FOCUSED"}]},{id:"tracking-recovery",label:"Tracking loss and recovery",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"event",event:"tracking-lost"},{action:"assert-state",state:"LOSS_PENDING"},{action:"event",event:"tracking-restored"},{action:"assert-state",state:"FOCUSED"}]}]);function c(t){if(typeof t!="string")return t;let e=y.find(r=>r.id===t);if(!e)throw new Error(`Unknown Frameulator scenario: ${t}`);return structuredClone(e)}var E={position:[0,1.65,0],orientation:[0,0,0,1]};function d(){return{headPose:structuredClone(E),controllers:{left:{pose:{position:[-.25,1.25,-.35],orientation:[0,0,0,1]}},right:{pose:{position:[.25,1.25,-.35],orientation:[0,0,0,1]}}},trackingAvailable:!0,compositorFrames:0,firmwareState:"booted"}}function f(){return Object.fromEntries(Object.entries({hardware:"ARM64 ABI, memory and timing contract model",gpu:"Qualcomm/Adreno capability and budget model",vulkan:"Vulkan-like resource and submission validator",openxr:"OpenXR 1.1 session and action state machine",compositor:"Gamescope-like focus, pacing and frame queue model",firmware:"Deterministic headset firmware lifecycle model",tracking:"Synthetic pose, drift, prediction and loss model",controllers:"Virtual Steam Frame controller actions",host:"In-browser service and socket contract message bus"}).map(([e,r])=>[e,{name:e,status:"simulated",simulated:!0,detail:r}]))}function w(t,e,r){switch(t){case"hardware.capabilities":return{...e.hardware,littleEndian:!0,simulated:!0};case"gpu.capabilities":return{...e.gpu,maxImageDimension2D:8192,simulated:!0};case"vulkan.capabilities":return{apiVersion:"1.3",queues:["graphics","compute","transfer"],nativeDriver:!1,simulated:!0};case"openxr.capabilities":return{...e.openxr,sessionStateModel:!0,nativeRuntime:!1,simulated:!0};case"compositor.status":return{queuedFrames:0,presentedFrames:r.compositorFrames,focused:!0,simulated:!0};case"firmware.status":return{state:r.firmwareState,version:"simulated-0.1.0",hardwareFirmware:!1,simulated:!0};case"tracking.status":return{available:r.trackingAvailable,pose:r.headPose,source:"synthetic",simulated:!0};case"controllers.status":return{connected:["left","right"],states:r.controllers,physicalControllers:!1,simulated:!0};case"host.status":return{transport:"worker-message-bus",nativeSockets:!1,services:9,simulated:!0};case"services.status":return f();default:throw new Error(`Unsupported Frameulator method: ${t}`)}}function x(t){if(typeof atob=="function"){let m=atob(t);return Uint8Array.from(m,l=>l.charCodeAt(0))}let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",r=t.replace(/=+$/,""),o=new Uint8Array(Math.floor(r.length*6/8)),a=0,i=0,g=0;for(let m of r){let l=e.indexOf(m);l<0||(a=a<<6|l,i+=6,i>=8&&(i-=8,o[g++]=a>>i&255))}return o}async function A(t){let e=await fetch(t);if(!e.ok)throw new Error(`Unable to load Frameulator WASM (${e.status}).`);return e.arrayBuffer()}async function S(t){let e=t.wasmBytes;if(!e&&t.wasmBase64&&(e=x(t.wasmBase64)),!e&&t.wasmUrl&&(e=await A(t.wasmUrl)),!e)throw new Error("No Frameulator WASM source was provided.");let r=e instanceof Uint8Array?e:new Uint8Array(e),i=(await WebAssembly.instantiate(r,{})).instance.exports;if(i.frameulator_abi_version()!==1)throw new Error("Unsupported Frameulator WASM ABI.");return i}var k=["IDLE","READY","SYNCHRONIZED","VISIBLE","FOCUSED","STOPPING","LOSS_PENDING","EXITING"],R={"tracking-lost":1,"tracking-restored":2,"runtime-exit":3,"focus-lost":4},u=class t{profile;wasm;world;lastReport;constructor(e,r){this.profile=e,this.wasm=r,this.world=d()}static async create(e={}){let o=!!(e.wasmBytes||e.wasmBase64||e.wasmUrl),a=await S({wasmBytes:e.wasmBytes,wasmBase64:e.wasmBase64||"",wasmUrl:o?e.wasmUrl:new URL("./frameulator.wasm",import.meta.url)});return a.frameulator_reset(),new t(b(e.profile),a)}get sessionState(){return k[this.wasm.frameulator_session_state()]??"IDLE"}get frameCount(){return Number(this.wasm.frameulator_frame_count())}get elapsedMilliseconds(){return Number(this.wasm.frameulator_elapsed_micros())/1e3}get snapshot(){return{sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,headPose:structuredClone(this.world.headPose),controllers:structuredClone(this.world.controllers),simulated:!0}}reset(){this.wasm.frameulator_reset(),this.world=d(),this.lastReport=void 0}start(){return this.wasm.frameulator_start(),this.sessionState}stop(){return this.wasm.frameulator_stop(),this.sessionState}step(e){if(!Number.isFinite(e)||e<0||e>1e3)throw new Error("Frame step must be between 0 and 1000 milliseconds.");return this.wasm.frameulator_step(Math.round(e*1e3)),this.world.compositorFrames+=1,this.sessionState}setHeadPose(e){this.world.headPose=structuredClone(e)}setControllerState(e,r){this.world.controllers[e]={...this.world.controllers[e],...structuredClone(r)}}injectEvent(e){return this.wasm.frameulator_inject_event(R[e]),e==="tracking-lost"&&(this.world.trackingAvailable=!1),e==="tracking-restored"&&(this.world.trackingAvailable=!0),this.sessionState}call(e){return w(e,this.profile,this.world)}async runScenario(e){let r=c(e),o=[];this.reset();for(let a of r.steps)switch(a.action){case"start":this.start();break;case"stop":this.stop();break;case"step":this.step(a.milliseconds);break;case"event":this.injectEvent(a.event);break;case"assert-state":{let i=this.sessionState;o.push({expected:a.state,actual:i,passed:i===a.state});break}}return this.lastReport={schemaVersion:1,frameulatorVersion:"0.1.0",scenario:r.id,profile:this.profile.id,simulated:!0,evidenceLevel:"F1-browser-wasm",passed:o.length>0&&o.every(a=>a.passed),sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,assertions:o,services:f(),generatedAt:new Date().toISOString()},structuredClone(this.lastReport)}exportReport(){if(!this.lastReport)throw new Error("Run a scenario before exporting a report.");return structuredClone(this.lastReport)}};var C=["IDLE","READY","SYNCHRONIZED","VISIBLE","FOCUSED","STOPPING","LOSS_PENDING"],p=class t{constructor(e){this.exports=e}static async create(e){let r=e instanceof Uint8Array?e:new Uint8Array(e),a=(await WebAssembly.instantiate(r,{})).instance.exports;if(typeof a.agora_capsule_abi_version!="function"||a.agora_capsule_abi_version()!==1)throw new Error("Unsupported Agora browser capsule ABI.");if(a.agora_capsule_version()!==1||a.agora_capsule_stereo_contract_valid()!==1)throw new Error("Agora browser capsule failed its stereo contract check.");return a.agora_capsule_reset(),new t(a)}reset(){this.exports.agora_capsule_reset()}start(){this.exports.agora_capsule_start()}stop(){this.exports.agora_capsule_stop()}step(e){this.exports.agora_capsule_step(Math.round(e*1e3))}setTracking(e){this.exports.agora_capsule_set_tracking(e?1:0)}get snapshot(){return{sessionState:C[this.exports.agora_capsule_session_state()]??"UNKNOWN",frameCount:Number(this.exports.agora_capsule_frame_count()),elapsedMilliseconds:Number(this.exports.agora_capsule_elapsed_micros())/1e3,scenePhaseRadians:this.exports.agora_capsule_scene_phase_milliradians()/1e3,stereoContractValid:this.exports.agora_capsule_stereo_contract_valid()===1,producer:"agora-browser-capsule"}}};function _(t,e){t.reset();for(let r of c(e).steps)switch(r.action){case"start":t.start();break;case"stop":t.stop();break;case"step":t.step(r.milliseconds);break;case"event":h(t,r.event);break;case"assert-state":break}return t.snapshot}function h(t,e){e==="tracking-lost"&&t.setTracking(!1),e==="tracking-restored"&&t.setTracking(!0),e==="runtime-exit"&&t.stop()}var s,n;async function F(t){if(t.method==="initialize")return s=await u.create(t.parameters??{}),{...s.snapshot,profile:s.profile,wasmAbi:1};if(!s)throw new Error("Frameulator Worker is not initialized.");switch(t.method){case"loadCapsule":return n=await p.create(t.parameters),n.snapshot;case"unloadCapsule":return n=void 0,{unloaded:!0};case"start":return n?.start(),{state:s.start(),applicationFrame:n?.snapshot};case"stop":return n?.stop(),{state:s.stop(),applicationFrame:n?.snapshot};case"step":return s.step(Number(t.parameters)),n?.step(Number(t.parameters)),{...s.snapshot,applicationFrame:n?.snapshot};case"setHeadPose":return s.setHeadPose(t.parameters),s.snapshot;case"setControllerState":{let{hand:e,state:r}=t.parameters;return s.setControllerState(e,r),s.snapshot}case"injectEvent":return n&&h(n,t.parameters),s.injectEvent(t.parameters),{...s.snapshot,state:s.sessionState,applicationFrame:n?.snapshot};case"runScenario":return{report:await s.runScenario(t.parameters),applicationFrame:n?_(n,t.parameters):void 0};case"exportReport":return s.exportReport();case"snapshot":return{...s.snapshot,applicationFrame:n?.snapshot};default:return s.call(t.method)}}self.addEventListener("message",async t=>{let e=t.data,r={protocol:"frameulator/1",requestId:e.requestId,ok:!0};try{r.result=await F(e)}catch(o){r.ok=!1,r.error=o instanceof Error?o.message:String(o)}self.postMessage(r)});\n'], { type: "text/javascript" });
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
    const request = { protocol: "frameulator/1", requestId, method, parameters };
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
    if (response.protocol !== "frameulator/1") return;
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
var BrowserCapsule = class _BrowserCapsule {
  constructor(exports) {
    this.exports = exports;
  }
  static async create(source) {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const result = await WebAssembly.instantiate(bytes, {});
    const exports = result.instance.exports;
    if (typeof exports.agora_capsule_abi_version !== "function" || exports.agora_capsule_abi_version() !== 1) {
      throw new Error("Unsupported Agora browser capsule ABI.");
    }
    if (exports.agora_capsule_version() !== 1 || exports.agora_capsule_stereo_contract_valid() !== 1) {
      throw new Error("Agora browser capsule failed its stereo contract check.");
    }
    exports.agora_capsule_reset();
    return new _BrowserCapsule(exports);
  }
  reset() {
    this.exports.agora_capsule_reset();
  }
  start() {
    this.exports.agora_capsule_start();
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
  get snapshot() {
    return {
      sessionState: states2[this.exports.agora_capsule_session_state()] ?? "UNKNOWN",
      frameCount: Number(this.exports.agora_capsule_frame_count()),
      elapsedMilliseconds: Number(this.exports.agora_capsule_elapsed_micros()) / 1e3,
      scenePhaseRadians: this.exports.agora_capsule_scene_phase_milliradians() / 1e3,
      stereoContractValid: this.exports.agora_capsule_stereo_contract_valid() === 1,
      producer: "agora-browser-capsule"
    };
  }
};
function runCapsuleScenario(capsule, input) {
  capsule.reset();
  for (const step of resolveScenario(input).steps) {
    switch (step.action) {
      case "start":
        capsule.start();
        break;
      case "stop":
        capsule.stop();
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
  return capsule.snapshot;
}
function applyCapsuleEvent(capsule, event) {
  if (event === "tracking-lost") capsule.setTracking(false);
  if (event === "tracking-restored") capsule.setTracking(true);
  if (event === "runtime-exit") capsule.stop();
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
  version = "0.1.0";
  simulated = true;
  renderer;
  running = false;
  frameRequest = 0;
  previousTime = 0;
  stepping = false;
  importedEvidence;
  applicationGate;
  lastReport;
  static async create(options = {}) {
    if (options.network && options.network !== "disabled") {
      throw new Error("Frameulator 0.1.0 only supports network: disabled.");
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
      this.emit("frameulator-flatpak-verified", result.verification);
      return result.verification;
    } catch (error) {
      if (this.applicationGate.state !== "REJECTED") {
        this.applicationGate.markFailed(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }
  async removeApplication() {
    if (this.running) await this.stop();
    await this.transport.request("unloadCapsule");
    this.lastReport = void 0;
    this.renderer?.clearApplicationFrame();
    this.applicationGate.reset();
  }
  setEyePreviews(left, right) {
    this.renderer?.setEyePreviews(left, right);
  }
  async start() {
    this.requireApplication();
    const result = await this.transport.request("start");
    this.applicationGate.markRunning();
    this.running = true;
    this.previousTime = performance.now();
    this.frameRequest = requestAnimationFrame(this.tick);
    this.emit("frameulator-state", result);
  }
  async stop() {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    const result = await this.transport.request("stop");
    if (this.applicationGate.verification?.accepted) this.applicationGate.markStopped();
    this.emit("frameulator-state", result);
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
      application: this.applicationEvidence(output.applicationFrame)
    };
    this.lastReport = structuredClone(report);
    if (["STOPPING", "IDLE"].includes(report.sessionState)) this.applicationGate.markStopped();
    else this.applicationGate.markRunning();
    await this.store.save(report);
    const snapshot = await this.transport.request("snapshot");
    this.renderer?.update(snapshot);
    this.emit("frameulator-result", report);
    this.emit("frameulator-state", { state: report.sessionState });
    return report;
  }
  async exportReport() {
    if (!this.lastReport) throw new Error("Run a verified Agora scenario before exporting a report.");
    return structuredClone(this.lastReport);
  }
  async latestReport() {
    return this.store.latest();
  }
  async importEvidence(input) {
    const evidence = input instanceof Blob ? JSON.parse(await input.text()) : structuredClone(input);
    const allowed = /* @__PURE__ */ new Set(["F3-native-vulkan", "F4-native-openxr", "F5-arm64-flatpak", "F6-device"]);
    if (evidence.simulated !== false || !allowed.has(evidence.evidenceLevel)) {
      throw new Error("Imported native evidence must be explicitly non-simulated and labeled F3 through F6.");
    }
    if (!evidence.producer || !evidence.scenario || !evidence.generatedAt) {
      throw new Error("Imported native evidence is missing producer, scenario, or generatedAt metadata.");
    }
    this.importedEvidence = evidence;
    return structuredClone(evidence);
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
      browserWasmSha256: release.browserWasmSha256
    };
  }
};

// packages/frameulator/src/styles.css
var styles_default = ':host {\n  --frame-bg: #050708;\n  --frame-panel: #0b1113;\n  --frame-line: rgba(172, 242, 231, 0.16);\n  --frame-mint: #69e2d0;\n  --frame-orange: #ff7548;\n  --frame-text: #eef8f5;\n  --frame-muted: #8fa6a3;\n  display: block;\n  color: var(--frame-text);\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n}\n\n* { box-sizing: border-box; }\nbutton, select { font: inherit; }\n\n.frameulator-shell {\n  min-height: 680px;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) 320px;\n  grid-template-rows: auto minmax(0, 1fr);\n  overflow: hidden;\n  border: 1px solid var(--frame-line);\n  border-radius: 24px;\n  background: var(--frame-bg);\n  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.44);\n}\n\n.frameulator-bar {\n  grid-column: 1 / -1;\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-height: 62px;\n  padding: 14px 18px;\n  border-bottom: 1px solid var(--frame-line);\n  background: rgba(10, 15, 17, 0.96);\n}\n\n.frameulator-mark {\n  width: 30px;\n  height: 30px;\n  border: 1px solid rgba(105, 226, 208, 0.55);\n  border-radius: 50%;\n  background: radial-gradient(circle at 36% 32%, #c6fff7 0 5%, #4ecfbe 6% 18%, #0b2828 19% 56%, #ff7548 57% 63%, transparent 64%);\n  box-shadow: 0 0 24px rgba(73, 215, 198, 0.28);\n}\n\n.frameulator-title { display: grid; gap: 2px; }\n.frameulator-title strong { font-size: 14px; letter-spacing: 0.04em; }\n.frameulator-title span { color: var(--frame-muted); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }\n.frameulator-evidence { margin-left: auto; padding: 7px 10px; border: 1px solid rgba(255, 117, 72, 0.28); border-radius: 999px; color: #ffb198; background: rgba(255, 117, 72, 0.07); font: 600 10px ui-monospace, monospace; letter-spacing: 0.08em; }\n\n.frameulator-stage { position: relative; min-width: 0; min-height: 520px; overflow: hidden; }\n.frameulator-stage > canvas { display: block; width: 100%; height: 100%; }\n.frameulator-reticle { pointer-events: none; position: absolute; inset: 50% auto auto 50%; width: 34px; height: 34px; border: 1px solid rgba(105, 226, 208, 0.28); border-radius: 50%; transform: translate(-50%, -50%); }\n.frameulator-reticle::before, .frameulator-reticle::after { content: ""; position: absolute; background: rgba(105, 226, 208, 0.35); }\n.frameulator-reticle::before { width: 48px; height: 1px; left: -8px; top: 16px; }\n.frameulator-reticle::after { width: 1px; height: 48px; left: 16px; top: -8px; }\n\n.frameulator-upload { position: absolute; z-index: 2; inset: 50% auto auto 50%; width: min(430px, calc(100% - 36px)); padding: 26px; transform: translate(-50%, -50%); border: 1px dashed rgba(105, 226, 208, 0.42); border-radius: 18px; background: rgba(5, 9, 10, 0.9); box-shadow: 0 22px 70px rgba(0,0,0,0.5); text-align: center; backdrop-filter: blur(16px); }\n.frameulator-upload[data-dragging="true"] { border-color: var(--frame-orange); background: rgba(27, 15, 13, 0.94); }\n.frameulator-upload[data-upload-state="READY"], .frameulator-upload[data-upload-state="STOPPED"] { border-style: solid; border-color: rgba(105, 226, 208, 0.68); }\n.frameulator-upload strong { display: block; margin-bottom: 9px; font-size: 22px; }\n.frameulator-upload p:not(.frameulator-label) { margin: 0 auto 18px; max-width: 340px; color: var(--frame-muted); font-size: 14px; line-height: 1.55; }\n.frameulator-upload button { min-height: 42px; padding: 0 17px; border: 1px solid rgba(105, 226, 208, 0.44); border-radius: 9px; color: #05100e; background: var(--frame-mint); cursor: pointer; font-weight: 650; }\n.frameulator-upload progress { width: 100%; height: 7px; margin-top: 18px; accent-color: var(--frame-mint); }\n.frameulator-upload [data-upload-detail] { display: block; margin-top: 14px; color: #9bb0ac; font: 12px/1.5 ui-monospace, monospace; }\n\n.frameulator-panel { padding: 18px; border-left: 1px solid var(--frame-line); background: linear-gradient(180deg, rgba(14, 22, 24, 0.98), rgba(7, 10, 11, 0.98)); overflow: auto; }\n.frameulator-label { margin: 0 0 9px; color: var(--frame-muted); font: 600 10px ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; }\n.frameulator-state { display: flex; align-items: center; gap: 9px; margin-bottom: 20px; font: 700 21px ui-monospace, monospace; }\n.frameulator-state::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--frame-mint); box-shadow: 0 0 12px var(--frame-mint); }\n\n.frameulator-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 22px; }\n.frameulator-actions button { min-height: 40px; padding: 0 12px; border: 1px solid var(--frame-line); border-radius: 9px; color: var(--frame-text); background: rgba(255,255,255,0.035); cursor: pointer; transition: border-color 150ms ease, transform 150ms ease, background 150ms ease; }\n.frameulator-actions button:first-child { grid-column: 1 / -1; border-color: rgba(105, 226, 208, 0.42); background: rgba(105, 226, 208, 0.1); }\n.frameulator-actions button:hover { transform: translateY(-1px); border-color: var(--frame-mint); background: rgba(105, 226, 208, 0.12); }\n.frameulator-actions button:disabled { opacity: 0.36; cursor: not-allowed; transform: none; }\n.frameulator-actions button[data-action="remove"] { grid-column: 1 / -1; color: #ffb198; }\n.frameulator-actions button:focus-visible { outline: 2px solid var(--frame-orange); outline-offset: 2px; }\n\n.frameulator-services { display: grid; gap: 1px; margin-bottom: 22px; border: 1px solid var(--frame-line); border-radius: 12px; overflow: hidden; background: var(--frame-line); }\n.frameulator-service { display: flex; justify-content: space-between; gap: 12px; padding: 9px 10px; background: var(--frame-panel); color: #c9d8d5; font-size: 11px; }\n.frameulator-service span:last-child { color: var(--frame-mint); font: 600 9px ui-monospace, monospace; text-transform: uppercase; }\n\n.frameulator-eyes { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }\n.frameulator-eye { position: relative; aspect-ratio: 1.35; overflow: hidden; border: 1px solid var(--frame-line); border-radius: 9px; background: #020303; }\n.frameulator-eye canvas { width: 100%; height: 100%; display: block; }\n.frameulator-report { min-height: 38px; margin-top: 15px; padding: 10px; border-radius: 9px; color: var(--frame-muted); background: rgba(255,255,255,0.025); font: 11px/1.45 ui-monospace, monospace; }\n.frameulator-report[data-passed="true"] { color: var(--frame-mint); background: rgba(105, 226, 208, 0.07); }\n\n@media (max-width: 800px) {\n  .frameulator-shell { grid-template-columns: 1fr; grid-template-rows: auto 460px auto; min-height: 0; }\n  .frameulator-stage { min-height: 460px; }\n  .frameulator-panel { border-left: 0; border-top: 1px solid var(--frame-line); }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .frameulator-actions button { transition: none; }\n}\n';

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
var FrameulatorElement = class extends HTMLElementBase {
  lab;
  initialized = false;
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.mount().catch((error) => this.showError(error));
  }
  disconnectedCallback() {
    this.lab?.destroy().catch(() => void 0);
    this.lab = void 0;
    this.initialized = false;
  }
  async mount() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${styles_default}</style>
      <section class="frameulator-shell" aria-label="Frameulator Steam Frame contract simulator">
        <header class="frameulator-bar">
          <span class="frameulator-mark" aria-hidden="true"></span>
          <span class="frameulator-title"><strong>Frameulator</strong><span>Steam Frame contract laboratory</span></span>
          <span class="frameulator-evidence">FLATPAK REQUIRED \xB7 F1/F2</span>
        </header>
        <div class="frameulator-stage">
          <span class="frameulator-reticle" aria-hidden="true"></span>
          <div class="frameulator-upload" data-upload-state="EMPTY">
            <input type="file" accept=".flatpak,application/vnd.flatpak" data-flatpak hidden />
            <p class="frameulator-label">Application gate</p>
            <strong>Upload Agora.flatpak</strong>
            <p>Your Flatpak remains in this browser. Nothing is uploaded to a remote server.</p>
            <button type="button" data-action="select">Select Flatpak</button>
            <progress value="0" max="1" hidden></progress>
            <span data-upload-detail>Select an approved, signed Agora release to begin.</span>
          </div>
        </div>
        <aside class="frameulator-panel">
          <p class="frameulator-label">Application</p>
          <div class="frameulator-state" role="status" aria-live="polite">EMPTY</div>
          <p class="frameulator-label">Scenario</p>
          <div class="frameulator-actions">
            <button type="button" data-action="run" disabled>Run normal session</button>
            <button type="button" data-action="loss" disabled>Lose tracking</button>
            <button type="button" data-action="recover" disabled>Restore</button>
            <button type="button" data-action="export" disabled>Export report</button>
            <button type="button" data-action="remove" disabled>Remove application</button>
          </div>
          <p class="frameulator-label">Service contracts</p>
          <div class="frameulator-services" aria-label="Simulated service status"></div>
          <p class="frameulator-label">Stereo framebuffer preview</p>
          <div class="frameulator-eyes">
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="left" aria-label="Left eye preview"></canvas></div>
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="right" aria-label="Right eye preview"></canvas></div>
          </div>
          <div class="frameulator-report">FLATPAK_REQUIRED \xB7 no application session is running.</div>
        </aside>
      </section>
    `;
    const stage = root.querySelector(".frameulator-stage");
    const left = root.querySelector('[data-eye="left"]');
    const right = root.querySelector('[data-eye="right"]');
    if (!stage || !left || !right) throw new Error("Unable to create the Frameulator interface.");
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
    this.forwardEvents();
    await this.renderServices();
    this.bindControls();
    this.dispatch("frameulator-ready", { version: this.lab.version, simulated: true, applicationState: "EMPTY" });
  }
  forwardEvents() {
    if (!this.lab) return;
    for (const type of ["frameulator-frame", "frameulator-state", "frameulator-result", "frameulator-error", "frameulator-application", "frameulator-flatpak-verified"]) {
      this.lab.addEventListener(type, ((event) => {
        if (type === "frameulator-application") this.setApplicationState(event.detail.state, event.detail.detail, event.detail.progress);
        if (type === "frameulator-state") this.setState(event.detail.state ?? event.detail.sessionState ?? "UNKNOWN");
        this.dispatch(type, event.detail);
      }));
    }
  }
  bindControls() {
    const root = this.shadowRoot;
    const input = root?.querySelector("[data-flatpak]");
    const upload = root?.querySelector(".frameulator-upload");
    root?.querySelector('[data-action="select"]')?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) this.selectFlatpak(file);
      input.value = "";
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
    root?.querySelector('[data-action="run"]')?.addEventListener("click", () => {
      const scenario = this.getAttribute("scenario") || "normal-session";
      this.lab?.runScenario(scenario).then((report) => this.showReport(report)).catch((error) => this.showError(error));
    });
    root?.querySelector('[data-action="loss"]')?.addEventListener("click", () => {
      this.lab?.injectEvent("tracking-lost").catch((error) => this.showError(error));
    });
    root?.querySelector('[data-action="recover"]')?.addEventListener("click", () => {
      this.lab?.injectEvent("tracking-restored").catch((error) => this.showError(error));
    });
    root?.querySelector('[data-action="export"]')?.addEventListener("click", () => {
      this.downloadReport().catch((error) => this.showError(error));
    });
    root?.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      this.lab?.removeApplication().catch((error) => this.showError(error));
    });
  }
  async renderServices() {
    const statuses = await this.lab?.call("services.status");
    const container = this.shadowRoot?.querySelector(".frameulator-services");
    if (!statuses || !container) return;
    container.innerHTML = serviceOrder.map((name) => `<div class="frameulator-service"><span>${name}</span><span>${statuses[name].status}</span></div>`).join("");
  }
  setState(state) {
    const element = this.shadowRoot?.querySelector(".frameulator-state");
    if (element) element.textContent = state;
  }
  selectFlatpak(file) {
    this.lab?.selectFlatpak(file).catch((error) => this.showError(error));
  }
  setApplicationState(state, detail, progress) {
    this.setState(state);
    const upload = this.shadowRoot?.querySelector(".frameulator-upload");
    const detailElement = this.shadowRoot?.querySelector("[data-upload-detail]");
    const progressElement = this.shadowRoot?.querySelector("progress");
    if (upload) upload.dataset.uploadState = state;
    if (detailElement) detailElement.textContent = detail;
    if (progressElement) {
      progressElement.hidden = state !== "HASHING";
      progressElement.value = progress ?? 0;
    }
    this.setDisabled("select", ["HASHING", "VERIFIED", "LOADING_CAPSULE"].includes(state));
    const ready = ["READY", "RUNNING", "STOPPED"].includes(state);
    this.setDisabled("run", !ready);
    this.setDisabled("loss", state !== "RUNNING");
    this.setDisabled("recover", state !== "RUNNING");
    this.setDisabled("remove", !ready && state !== "REJECTED" && state !== "FAILED");
    if (upload) upload.hidden = state === "RUNNING";
  }
  setDisabled(action, disabled) {
    const button = this.shadowRoot?.querySelector(`[data-action="${action}"]`);
    if (button) button.disabled = disabled;
  }
  showReport(report) {
    this.setState(report.sessionState);
    const element = this.shadowRoot?.querySelector(".frameulator-report");
    if (!element) return;
    element.dataset.passed = String(report.passed);
    this.setDisabled("export", false);
    element.textContent = report.passed ? `PASS \xB7 ${report.scenario} \xB7 ${report.frameCount} frames \xB7 F1 simulated` : `FAIL \xB7 ${report.scenario} \xB7 inspect exported assertions`;
  }
  showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    const element = this.shadowRoot?.querySelector(".frameulator-report");
    if (element) {
      element.dataset.passed = "false";
      element.textContent = `ERROR \xB7 ${message}`;
    }
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
