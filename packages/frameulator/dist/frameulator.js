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
      const source = this.renderer.domElement;
      const width = canvas.width;
      const height = canvas.height;
      const cropWidth = source.width * 0.72;
      const offset = index === 0 ? 0 : source.width - cropWidth;
      context.drawImage(source, offset, 0, cropWidth, source.height, 0, 0, width, height);
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
      const blob = new Blob(['var w=Object.freeze({id:"steam-frame",label:"Steam Frame browser contract",version:"0.1.0",simulated:!0,evidenceLevel:"F1-browser-wasm",display:{eyeWidth:1440,eyeHeight:1440,refreshRatesHz:[72,90,120],defaultRefreshRateHz:72},hardware:{architecture:"aarch64",memoryMiB:16384},gpu:{vendor:"Qualcomm",family:"Adreno",driver:"simulated-contract",api:"Vulkan 1.3 contract"},openxr:{apiVersion:"1.1",runtime:"SteamVR contract model",viewConfiguration:"PRIMARY_STEREO"}});function d(t){if(t===void 0||t==="steam-frame")return w;if(!t.simulated||t.evidenceLevel!=="F1-browser-wasm")throw new Error("Browser profiles must be explicitly labeled simulated at F1-browser-wasm.");return t}var b=Object.freeze([{id:"normal-session",label:"Normal OpenXR session",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"assert-state",state:"FOCUSED"}]},{id:"tracking-recovery",label:"Tracking loss and recovery",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"event",event:"tracking-lost"},{action:"assert-state",state:"LOSS_PENDING"},{action:"event",event:"tracking-restored"},{action:"assert-state",state:"FOCUSED"}]}]);function p(t){if(typeof t!="string")return t;let e=b.find(r=>r.id===t);if(!e)throw new Error(`Unknown Frameulator scenario: ${t}`);return structuredClone(e)}var v={position:[0,1.65,0],orientation:[0,0,0,1]};function u(){return{headPose:structuredClone(v),controllers:{left:{pose:{position:[-.25,1.25,-.35],orientation:[0,0,0,1]}},right:{pose:{position:[.25,1.25,-.35],orientation:[0,0,0,1]}}},trackingAvailable:!0,compositorFrames:0,firmwareState:"booted"}}function m(){return Object.fromEntries(Object.entries({hardware:"ARM64 ABI, memory and timing contract model",gpu:"Qualcomm/Adreno capability and budget model",vulkan:"Vulkan-like resource and submission validator",openxr:"OpenXR 1.1 session and action state machine",compositor:"Gamescope-like focus, pacing and frame queue model",firmware:"Deterministic headset firmware lifecycle model",tracking:"Synthetic pose, drift, prediction and loss model",controllers:"Virtual Steam Frame controller actions",host:"In-browser service and socket contract message bus"}).map(([e,r])=>[e,{name:e,status:"simulated",simulated:!0,detail:r}]))}function f(t,e,r){switch(t){case"hardware.capabilities":return{...e.hardware,littleEndian:!0,simulated:!0};case"gpu.capabilities":return{...e.gpu,maxImageDimension2D:8192,simulated:!0};case"vulkan.capabilities":return{apiVersion:"1.3",queues:["graphics","compute","transfer"],nativeDriver:!1,simulated:!0};case"openxr.capabilities":return{...e.openxr,sessionStateModel:!0,nativeRuntime:!1,simulated:!0};case"compositor.status":return{queuedFrames:0,presentedFrames:r.compositorFrames,focused:!0,simulated:!0};case"firmware.status":return{state:r.firmwareState,version:"simulated-0.1.0",hardwareFirmware:!1,simulated:!0};case"tracking.status":return{available:r.trackingAvailable,pose:r.headPose,source:"synthetic",simulated:!0};case"controllers.status":return{connected:["left","right"],states:r.controllers,physicalControllers:!1,simulated:!0};case"host.status":return{transport:"worker-message-bus",nativeSockets:!1,services:9,simulated:!0};case"services.status":return m();default:throw new Error(`Unsupported Frameulator method: ${t}`)}}function g(t){if(typeof atob=="function"){let c=atob(t);return Uint8Array.from(c,i=>i.charCodeAt(0))}let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",r=t.replace(/=+$/,""),o=new Uint8Array(Math.floor(r.length*6/8)),a=0,n=0,S=0;for(let c of r){let i=e.indexOf(c);i<0||(a=a<<6|i,n+=6,n>=8&&(n-=8,o[S++]=a>>n&255))}return o}async function y(t){let e=await fetch(t);if(!e.ok)throw new Error(`Unable to load Frameulator WASM (${e.status}).`);return e.arrayBuffer()}async function h(t){let e=t.wasmBytes;if(!e&&t.wasmBase64&&(e=g(t.wasmBase64)),!e&&t.wasmUrl&&(e=await y(t.wasmUrl)),!e)throw new Error("No Frameulator WASM source was provided.");let r=e instanceof Uint8Array?e:new Uint8Array(e),n=(await WebAssembly.instantiate(r,{})).instance.exports;if(n.frameulator_abi_version()!==1)throw new Error("Unsupported Frameulator WASM ABI.");return n}var R=["IDLE","READY","SYNCHRONIZED","VISIBLE","FOCUSED","STOPPING","LOSS_PENDING","EXITING"],E={"tracking-lost":1,"tracking-restored":2,"runtime-exit":3,"focus-lost":4},l=class t{profile;wasm;world;lastReport;constructor(e,r){this.profile=e,this.wasm=r,this.world=u()}static async create(e={}){let o=!!(e.wasmBytes||e.wasmBase64||e.wasmUrl),a=await h({wasmBytes:e.wasmBytes,wasmBase64:e.wasmBase64||"",wasmUrl:o?e.wasmUrl:new URL("./frameulator.wasm",import.meta.url)});return a.frameulator_reset(),new t(d(e.profile),a)}get sessionState(){return R[this.wasm.frameulator_session_state()]??"IDLE"}get frameCount(){return Number(this.wasm.frameulator_frame_count())}get elapsedMilliseconds(){return Number(this.wasm.frameulator_elapsed_micros())/1e3}get snapshot(){return{sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,headPose:structuredClone(this.world.headPose),controllers:structuredClone(this.world.controllers),simulated:!0}}reset(){this.wasm.frameulator_reset(),this.world=u(),this.lastReport=void 0}start(){return this.wasm.frameulator_start(),this.sessionState}stop(){return this.wasm.frameulator_stop(),this.sessionState}step(e){if(!Number.isFinite(e)||e<0||e>1e3)throw new Error("Frame step must be between 0 and 1000 milliseconds.");return this.wasm.frameulator_step(Math.round(e*1e3)),this.world.compositorFrames+=1,this.sessionState}setHeadPose(e){this.world.headPose=structuredClone(e)}setControllerState(e,r){this.world.controllers[e]={...this.world.controllers[e],...structuredClone(r)}}injectEvent(e){return this.wasm.frameulator_inject_event(E[e]),e==="tracking-lost"&&(this.world.trackingAvailable=!1),e==="tracking-restored"&&(this.world.trackingAvailable=!0),this.sessionState}call(e){return f(e,this.profile,this.world)}async runScenario(e){let r=p(e),o=[];this.reset();for(let a of r.steps)switch(a.action){case"start":this.start();break;case"stop":this.stop();break;case"step":this.step(a.milliseconds);break;case"event":this.injectEvent(a.event);break;case"assert-state":{let n=this.sessionState;o.push({expected:a.state,actual:n,passed:n===a.state});break}}return this.lastReport={schemaVersion:1,frameulatorVersion:"0.1.0",scenario:r.id,profile:this.profile.id,simulated:!0,evidenceLevel:"F1-browser-wasm",passed:o.length>0&&o.every(a=>a.passed),sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,assertions:o,services:m(),generatedAt:new Date().toISOString()},structuredClone(this.lastReport)}exportReport(){if(!this.lastReport)throw new Error("Run a scenario before exporting a report.");return structuredClone(this.lastReport)}};var s;async function _(t){if(t.method==="initialize")return s=await l.create(t.parameters??{}),{...s.snapshot,profile:s.profile,wasmAbi:1};if(!s)throw new Error("Frameulator Worker is not initialized.");switch(t.method){case"start":return{state:s.start()};case"stop":return{state:s.stop()};case"step":return s.step(Number(t.parameters)),s.snapshot;case"setHeadPose":return s.setHeadPose(t.parameters),s.snapshot;case"setControllerState":{let{hand:e,state:r}=t.parameters;return s.setControllerState(e,r),s.snapshot}case"injectEvent":return{state:s.injectEvent(t.parameters)};case"runScenario":return s.runScenario(t.parameters);case"exportReport":return s.exportReport();case"snapshot":return s.snapshot;default:return s.call(t.method)}}self.addEventListener("message",async t=>{let e=t.data,r={protocol:"frameulator/1",requestId:e.requestId,ok:!0};try{r.result=await _(e)}catch(o){r.ok=!1,r.error=o instanceof Error?o.message:String(o)}self.postMessage(r)});\n'], { type: "text/javascript" });
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

// packages/frameulator/src/Frameulator.ts
var LocalTransport = class _LocalTransport {
  constructor(kernel) {
    this.kernel = kernel;
  }
  static async create(options) {
    return new _LocalTransport(await FrameulatorKernel.create(options));
  }
  async request(method, parameters) {
    switch (method) {
      case "start":
        return { state: this.kernel.start() };
      case "stop":
        return { state: this.kernel.stop() };
      case "step":
        this.kernel.step(Number(parameters));
        return this.kernel.snapshot;
      case "setHeadPose":
        this.kernel.setHeadPose(parameters);
        return this.kernel.snapshot;
      case "setControllerState": {
        const { hand, state } = parameters;
        this.kernel.setControllerState(hand, state);
        return this.kernel.snapshot;
      }
      case "injectEvent":
        return { state: this.kernel.injectEvent(parameters) };
      case "runScenario":
        return this.kernel.runScenario(parameters);
      case "exportReport":
        return this.kernel.exportReport();
      case "snapshot":
        return this.kernel.snapshot;
      default:
        return this.kernel.call(method);
    }
  }
  destroy() {
  }
};
var Frameulator = class _Frameulator extends EventTarget {
  constructor(transport, store) {
    super();
    this.transport = transport;
    this.store = store;
  }
  version = "0.1.0";
  simulated = true;
  renderer;
  running = false;
  frameRequest = 0;
  previousTime = 0;
  stepping = false;
  importedEvidence;
  static async create(options = {}) {
    if (options.network && options.network !== "disabled") {
      throw new Error("Frameulator 0.1.0 only supports network: disabled.");
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
    const frameulator = new _Frameulator(transport, store);
    if (options.container && options.renderer !== "none") {
      frameulator.renderer = new FrameulatorRenderer(options.container);
    }
    frameulator.emit("frameulator-ready", { version: frameulator.version, simulated: true });
    return frameulator;
  }
  setEyePreviews(left, right) {
    this.renderer?.setEyePreviews(left, right);
  }
  async start() {
    const result = await this.transport.request("start");
    this.running = true;
    this.previousTime = performance.now();
    this.frameRequest = requestAnimationFrame(this.tick);
    this.emit("frameulator-state", result);
  }
  async stop() {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    const result = await this.transport.request("stop");
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
    this.emit("frameulator-state", result);
  }
  async call(method) {
    return this.transport.request(method);
  }
  async run(input) {
    return this.runScenario(input);
  }
  async runScenario(input) {
    const report = await this.transport.request("runScenario", input);
    await this.store.save(report);
    const snapshot = await this.transport.request("snapshot");
    this.renderer?.update(snapshot);
    this.emit("frameulator-result", report);
    this.emit("frameulator-state", { state: report.sessionState });
    return report;
  }
  async exportReport() {
    return this.transport.request("exportReport");
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
};

// packages/frameulator/src/styles.css
var styles_default = ':host {\n  --frame-bg: #050708;\n  --frame-panel: #0b1113;\n  --frame-line: rgba(172, 242, 231, 0.16);\n  --frame-mint: #69e2d0;\n  --frame-orange: #ff7548;\n  --frame-text: #eef8f5;\n  --frame-muted: #8fa6a3;\n  display: block;\n  color: var(--frame-text);\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n}\n\n* { box-sizing: border-box; }\nbutton, select { font: inherit; }\n\n.frameulator-shell {\n  min-height: 680px;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) 320px;\n  grid-template-rows: auto minmax(0, 1fr);\n  overflow: hidden;\n  border: 1px solid var(--frame-line);\n  border-radius: 24px;\n  background: var(--frame-bg);\n  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.44);\n}\n\n.frameulator-bar {\n  grid-column: 1 / -1;\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-height: 62px;\n  padding: 14px 18px;\n  border-bottom: 1px solid var(--frame-line);\n  background: rgba(10, 15, 17, 0.96);\n}\n\n.frameulator-mark {\n  width: 30px;\n  height: 30px;\n  border: 1px solid rgba(105, 226, 208, 0.55);\n  border-radius: 50%;\n  background: radial-gradient(circle at 36% 32%, #c6fff7 0 5%, #4ecfbe 6% 18%, #0b2828 19% 56%, #ff7548 57% 63%, transparent 64%);\n  box-shadow: 0 0 24px rgba(73, 215, 198, 0.28);\n}\n\n.frameulator-title { display: grid; gap: 2px; }\n.frameulator-title strong { font-size: 14px; letter-spacing: 0.04em; }\n.frameulator-title span { color: var(--frame-muted); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }\n.frameulator-evidence { margin-left: auto; padding: 7px 10px; border: 1px solid rgba(255, 117, 72, 0.28); border-radius: 999px; color: #ffb198; background: rgba(255, 117, 72, 0.07); font: 600 10px ui-monospace, monospace; letter-spacing: 0.08em; }\n\n.frameulator-stage { position: relative; min-width: 0; min-height: 520px; overflow: hidden; }\n.frameulator-stage > canvas { display: block; width: 100%; height: 100%; }\n.frameulator-reticle { pointer-events: none; position: absolute; inset: 50% auto auto 50%; width: 34px; height: 34px; border: 1px solid rgba(105, 226, 208, 0.28); border-radius: 50%; transform: translate(-50%, -50%); }\n.frameulator-reticle::before, .frameulator-reticle::after { content: ""; position: absolute; background: rgba(105, 226, 208, 0.35); }\n.frameulator-reticle::before { width: 48px; height: 1px; left: -8px; top: 16px; }\n.frameulator-reticle::after { width: 1px; height: 48px; left: 16px; top: -8px; }\n\n.frameulator-panel { padding: 18px; border-left: 1px solid var(--frame-line); background: linear-gradient(180deg, rgba(14, 22, 24, 0.98), rgba(7, 10, 11, 0.98)); overflow: auto; }\n.frameulator-label { margin: 0 0 9px; color: var(--frame-muted); font: 600 10px ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; }\n.frameulator-state { display: flex; align-items: center; gap: 9px; margin-bottom: 20px; font: 700 21px ui-monospace, monospace; }\n.frameulator-state::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--frame-mint); box-shadow: 0 0 12px var(--frame-mint); }\n\n.frameulator-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 22px; }\n.frameulator-actions button { min-height: 40px; padding: 0 12px; border: 1px solid var(--frame-line); border-radius: 9px; color: var(--frame-text); background: rgba(255,255,255,0.035); cursor: pointer; transition: border-color 150ms ease, transform 150ms ease, background 150ms ease; }\n.frameulator-actions button:first-child { grid-column: 1 / -1; border-color: rgba(105, 226, 208, 0.42); background: rgba(105, 226, 208, 0.1); }\n.frameulator-actions button:hover { transform: translateY(-1px); border-color: var(--frame-mint); background: rgba(105, 226, 208, 0.12); }\n.frameulator-actions button:focus-visible { outline: 2px solid var(--frame-orange); outline-offset: 2px; }\n\n.frameulator-services { display: grid; gap: 1px; margin-bottom: 22px; border: 1px solid var(--frame-line); border-radius: 12px; overflow: hidden; background: var(--frame-line); }\n.frameulator-service { display: flex; justify-content: space-between; gap: 12px; padding: 9px 10px; background: var(--frame-panel); color: #c9d8d5; font-size: 11px; }\n.frameulator-service span:last-child { color: var(--frame-mint); font: 600 9px ui-monospace, monospace; text-transform: uppercase; }\n\n.frameulator-eyes { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }\n.frameulator-eye { position: relative; aspect-ratio: 1.35; overflow: hidden; border: 1px solid var(--frame-line); border-radius: 9px; background: #020303; }\n.frameulator-eye canvas { width: 100%; height: 100%; display: block; }\n.frameulator-report { min-height: 38px; margin-top: 15px; padding: 10px; border-radius: 9px; color: var(--frame-muted); background: rgba(255,255,255,0.025); font: 11px/1.45 ui-monospace, monospace; }\n.frameulator-report[data-passed="true"] { color: var(--frame-mint); background: rgba(105, 226, 208, 0.07); }\n\n@media (max-width: 800px) {\n  .frameulator-shell { grid-template-columns: 1fr; grid-template-rows: auto 460px auto; min-height: 0; }\n  .frameulator-stage { min-height: 460px; }\n  .frameulator-panel { border-left: 0; border-top: 1px solid var(--frame-line); }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .frameulator-actions button { transition: none; }\n}\n\n';

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
          <span class="frameulator-evidence">SIMULATED \xB7 F1</span>
        </header>
        <div class="frameulator-stage"><span class="frameulator-reticle" aria-hidden="true"></span></div>
        <aside class="frameulator-panel">
          <p class="frameulator-label">OpenXR session</p>
          <div class="frameulator-state" role="status" aria-live="polite">IDLE</div>
          <p class="frameulator-label">Scenario</p>
          <div class="frameulator-actions">
            <button type="button" data-action="run">Run normal session</button>
            <button type="button" data-action="loss">Lose tracking</button>
            <button type="button" data-action="recover">Restore</button>
            <button type="button" data-action="export">Export report</button>
          </div>
          <p class="frameulator-label">Service contracts</p>
          <div class="frameulator-services" aria-label="Simulated service status"></div>
          <p class="frameulator-label">Stereo framebuffer preview</p>
          <div class="frameulator-eyes">
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="left" aria-label="Left eye preview"></canvas></div>
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="right" aria-label="Right eye preview"></canvas></div>
          </div>
          <div class="frameulator-report">Ready to run a deterministic browser scenario.</div>
        </aside>
      </section>
    `;
    const stage = root.querySelector(".frameulator-stage");
    const left = root.querySelector('[data-eye="left"]');
    const right = root.querySelector('[data-eye="right"]');
    if (!stage || !left || !right) throw new Error("Unable to create the Frameulator interface.");
    this.lab = await Frameulator.create({
      container: stage,
      profile: "steam-frame",
      renderer: "auto",
      storage: "indexeddb",
      network: "disabled",
      worker: "inline"
    });
    this.lab.setEyePreviews(left, right);
    this.forwardEvents();
    await this.renderServices();
    this.bindControls();
    this.dispatch("frameulator-ready", { version: this.lab.version, simulated: true });
  }
  forwardEvents() {
    if (!this.lab) return;
    for (const type of ["frameulator-frame", "frameulator-state", "frameulator-result", "frameulator-error"]) {
      this.lab.addEventListener(type, ((event) => {
        if (type === "frameulator-state") this.setState(String(event.detail.state ?? "IDLE"));
        this.dispatch(type, event.detail);
      }));
    }
  }
  bindControls() {
    const root = this.shadowRoot;
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
  showReport(report) {
    this.setState(report.sessionState);
    const element = this.shadowRoot?.querySelector(".frameulator-report");
    if (!element) return;
    element.dataset.passed = String(report.passed);
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
  SteamFrameProfile,
  createScenario,
  defineFrameulatorElement
};
//# sourceMappingURL=frameulator.js.map
