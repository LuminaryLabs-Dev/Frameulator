/* Frameulator 0.3.0 | MIT */

// packages/frameulator/src/renderer/FrameulatorRenderer.ts
import * as THREE from "three";
var FrameulatorRenderer = class {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(527891, 1);
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
    this.scene.fog = new THREE.FogExp2(527891, 0.055);
    this.scene.add(new THREE.HemisphereLight(13953279, 1384742, 2.4));
    const key = new THREE.DirectionalLight(11389439, 4);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 857886, roughness: 0.82, metalness: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(14, 28, 3232350, 1585725);
    grid.material.opacity = 0.55;
    grid.material.transparent = true;
    this.scene.add(grid);
    this.buildHeadset();
    this.buildController(this.controllers.left, 7920325);
    this.buildController(this.controllers.right, 15842947);
    this.head.position.set(0, 1.65, 0);
    this.controllers.left.position.set(-0.36, 1.13, 0.14);
    this.controllers.right.position.set(0.36, 1.13, 0.14);
    this.scene.add(this.head, this.controllers.left, this.controllers.right);
    this.observer.observe(container);
    this.resize();
    this.animate();
  }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(54, 1, 0.01, 100);
  renderer;
  head = new THREE.Group();
  controllers = { left: new THREE.Group(), right: new THREE.Group() };
  observer = new ResizeObserver(() => this.resize());
  surfaceViews = /* @__PURE__ */ new Map();
  raycaster = new THREE.Raycaster();
  eyeCamera = new THREE.PerspectiveCamera(72, 180 / 132, 0.01, 30);
  eyeTargets = [
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true }),
    new THREE.WebGLRenderTarget(180, 132, { depthBuffer: true })
  ];
  eyePixels = [new Uint8Array(180 * 132 * 4), new Uint8Array(180 * 132 * 4)];
  previews;
  inputHandler;
  capturedPointer;
  animationFrame = 0;
  destroyed = false;
  setEyePreviews(left, right) {
    this.previews = [left, right];
  }
  setInputHandler(handler) {
    this.inputHandler = handler;
  }
  update(snapshot) {
    this.applyPose(this.head, snapshot.headPose);
    this.applyController(this.controllers.left, snapshot.controllers.left);
    this.applyController(this.controllers.right, snapshot.controllers.right);
    this.updateSurfaces(snapshot.applicationFrame?.surfaces ?? []);
  }
  clearApplicationFrame() {
    this.cancelPointer();
    for (const view of this.surfaceViews.values()) this.disposeSurface(view);
    this.surfaceViews.clear();
    for (const canvas of this.previews ?? []) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.clearApplicationFrame();
    this.inputHandler = void 0;
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      this.renderer.domElement.removeEventListener(type, this.handlePointer);
    }
    this.renderer.domElement.removeEventListener("lostpointercapture", this.handleLostCapture);
    this.scene.traverse((object) => {
      const mesh = object;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((item) => item.dispose());
      else mesh.material?.dispose();
    });
    this.eyeTargets.forEach((target) => target.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
  updateSurfaces(surfaces) {
    const visible = surfaces.filter((surface) => surface.visible !== false);
    const ids = new Set(visible.map((surface) => surface.id));
    if (this.capturedPointer && !ids.has(this.capturedPointer.input.surfaceId)) this.cancelPointer();
    for (const [id, view] of this.surfaceViews) {
      if (!ids.has(id)) {
        this.disposeSurface(view);
        this.surfaceViews.delete(id);
      }
    }
    visible.forEach((surface, index) => {
      let view = this.surfaceViews.get(surface.id);
      if (view && (view.width !== surface.width || view.height !== surface.height)) {
        this.disposeSurface(view);
        this.surfaceViews.delete(surface.id);
        view = void 0;
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
          new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, toneMapped: false })
        );
        mesh.userData.surfaceId = surface.id;
        this.scene.add(mesh);
        view = { mesh, texture, width: surface.width, height: surface.height, revision: surface.revision };
        this.surfaceViews.set(surface.id, view);
      } else if (view.revision !== surface.revision) {
        view.texture.image.data.set(surface.rgba);
        view.texture.needsUpdate = true;
        view.revision = surface.revision;
      }
      const aspect = surface.width / surface.height;
      const width = Math.min(2.2, 1.45 * aspect);
      const height = width / aspect;
      view.mesh.scale.set(width, height, 1);
      view.mesh.position.set((index - (visible.length - 1) / 2) * 2.4, 1.5, -1.65);
    });
  }
  disposeSurface(view) {
    this.scene.remove(view.mesh);
    view.texture.dispose();
    view.mesh.geometry.dispose();
    view.mesh.material.dispose();
  }
  handlePointer = (event) => {
    if (!this.inputHandler || this.capturedPointer && event.pointerId !== this.capturedPointer.pointerId) return;
    const phase = { pointerdown: "down", pointermove: "move", pointerup: "up", pointercancel: "cancel" }[event.type];
    if (phase === "cancel") {
      this.cancelPointer();
      return;
    }
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (phase === "up" && this.capturedPointer && (event.clientX < bounds.left || event.clientX > bounds.left + bounds.width || event.clientY < bounds.top || event.clientY > bounds.top + bounds.height)) {
      this.cancelPointer();
      return;
    }
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (event.clientY - bounds.top) / bounds.height * 2
    ), this.camera);
    const target = this.capturedPointer?.input.surfaceId;
    const meshes = Array.from(this.surfaceViews.entries()).filter(([id]) => !target || id === target).map(([, view]) => view.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    const previous = this.capturedPointer?.input;
    if (!hit?.uv) {
      if (phase === "up" && previous) this.cancelPointer();
      return;
    }
    const button = phase === "move" ? previous?.button ?? 0 : event.button;
    const input = {
      type: "pointer",
      surfaceId: String(hit.object.userData.surfaceId),
      phase,
      x: Math.max(0, Math.min(1, hit.uv.x)),
      y: Math.max(0, Math.min(1, 1 - hit.uv.y)),
      button
    };
    if (phase === "down") {
      event.preventDefault();
      this.capturedPointer = { pointerId: event.pointerId, input };
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } else if (this.capturedPointer) this.capturedPointer.input = input;
    this.inputHandler(input);
    if (phase === "up") {
      this.capturedPointer = void 0;
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };
  handleLostCapture = () => {
    this.cancelPointer();
  };
  cancelPointer() {
    const pointer = this.capturedPointer;
    if (!pointer) return;
    this.capturedPointer = void 0;
    this.inputHandler?.({ ...pointer.input, phase: "cancel" });
    if (this.renderer.domElement.hasPointerCapture(pointer.pointerId)) this.renderer.domElement.releasePointerCapture(pointer.pointerId);
  }
  buildHeadset() {
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.25, 0.2, 3, 2, 2),
      new THREE.MeshStandardMaterial({ color: 15199980, roughness: 0.28, metalness: 0.45 })
    );
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.15, 0.025),
      new THREE.MeshPhysicalMaterial({ color: 465438, emissive: 812904, emissiveIntensity: 0.6, roughness: 0.08 })
    );
    visor.position.z = 0.112;
    this.head.add(shell, visor);
  }
  buildController(group, color) {
    const grip = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.18, 5, 12),
      new THREE.MeshStandardMaterial({ color: 14477028, roughness: 0.32, metalness: 0.45 })
    );
    grip.rotation.x = Math.PI / 7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 36), new THREE.MeshBasicMaterial({ color }));
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
    object.scale.setScalar(1 + Math.max(0, Math.min(1, state.trigger ?? 0)) * 0.12);
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
    this.renderer.render(this.scene, this.camera);
    this.copyPreviews();
    this.animationFrame = requestAnimationFrame(this.animate);
  };
  copyPreviews() {
    if (!this.previews) return;
    for (const [index, canvas] of this.previews.entries()) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const width = 180;
      const height = 132;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      this.eyeCamera.position.set(index === 0 ? -0.032 : 0.032, 1.65, 0.05);
      this.eyeCamera.lookAt(0, 1.5, -1.65);
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
};

// packages/frameulator/src/WorkerClient.ts
var WorkerClient = class _WorkerClient {
  worker;
  pending = /* @__PURE__ */ new Map();
  requestId = 0;
  destroyed = false;
  blobUrl;
  constructor(worker, blobUrl) {
    this.worker = worker;
    this.blobUrl = blobUrl;
    worker.addEventListener(
      "message",
      (event) => this.receive(event.data)
    );
    worker.addEventListener(
      "error",
      (event) => this.failAll(event.error ?? new Error(event.message))
    );
  }
  static async create(options) {
    let worker;
    let blobUrl;
    if (options.workerUrl) {
      worker = new Worker(String(options.workerUrl), {
        name: "frameulator",
        type: "module"
      });
    } else {
      if (false) {
        throw new Error(
          "Inline Worker code is unavailable; provide workerUrl or set worker to false."
        );
      }
      const blob = new Blob(['var D=Object.freeze({id:"steam-frame",label:"Steam Frame browser contract",version:"0.2.0",simulated:!0,evidenceLevel:"F1-browser-wasm",display:{eyeWidth:1440,eyeHeight:1440,refreshRatesHz:[72,90,120],defaultRefreshRateHz:72},hardware:{architecture:"aarch64",memoryMiB:16384},gpu:{vendor:"Qualcomm",family:"Adreno",driver:"simulated-contract",api:"Vulkan 1.3 contract"},openxr:{apiVersion:"1.1",runtime:"SteamVR contract model",viewConfiguration:"PRIMARY_STEREO"}});function I(a){if(a===void 0||a==="steam-frame")return D;if(!a.simulated||a.evidenceLevel!=="F1-browser-wasm")throw new Error("Browser profiles must be explicitly labeled simulated at F1-browser-wasm.");return a}var M=Object.freeze([{id:"normal-session",label:"Normal OpenXR session",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"step",milliseconds:13.888},{action:"assert-state",state:"FOCUSED"}]},{id:"tracking-recovery",label:"Tracking loss and recovery",steps:[{action:"start"},{action:"step",milliseconds:13.888},{action:"event",event:"tracking-lost"},{action:"assert-state",state:"LOSS_PENDING"},{action:"event",event:"tracking-restored"},{action:"assert-state",state:"FOCUSED"}]}]);function F(a){if(typeof a!="string")return a;let e=M.find(s=>s.id===a);if(!e)throw new Error(`Unknown Frameulator scenario: ${a}`);return structuredClone(e)}var q={position:[0,1.65,0],orientation:[0,0,0,1]};function A(){return{headPose:structuredClone(q),controllers:{left:{pose:{position:[-.25,1.25,-.35],orientation:[0,0,0,1]}},right:{pose:{position:[.25,1.25,-.35],orientation:[0,0,0,1]}}},trackingAvailable:!0,compositorFrames:0,firmwareState:"booted"}}function k(){return Object.fromEntries(Object.entries({hardware:"ARM64 ABI, memory and timing contract model",gpu:"Qualcomm/Adreno capability and budget model",vulkan:"Vulkan-like resource and submission validator",openxr:"OpenXR 1.1 session and action state machine",compositor:"Gamescope-like focus, pacing and frame queue model",firmware:"Deterministic headset firmware lifecycle model",tracking:"Synthetic pose, drift, prediction and loss model",controllers:"Virtual Steam Frame controller actions",host:"In-browser service and socket contract message bus"}).map(([e,s])=>[e,{name:e,status:"simulated",simulated:!0,detail:s}]))}function N(a,e,s){switch(a){case"hardware.capabilities":return{...e.hardware,littleEndian:!0,simulated:!0};case"gpu.capabilities":return{...e.gpu,maxImageDimension2D:8192,simulated:!0};case"vulkan.capabilities":return{apiVersion:"1.3",queues:["graphics","compute","transfer"],nativeDriver:!1,simulated:!0};case"openxr.capabilities":return{...e.openxr,sessionStateModel:!0,nativeRuntime:!1,simulated:!0};case"compositor.status":return{queuedFrames:0,presentedFrames:s.compositorFrames,focused:!0,simulated:!0};case"firmware.status":return{state:s.firmwareState,version:"simulated-0.2.0",hardwareFirmware:!1,simulated:!0};case"tracking.status":return{available:s.trackingAvailable,pose:s.headPose,source:"synthetic",simulated:!0};case"controllers.status":return{connected:["left","right"],states:s.controllers,physicalControllers:!1,simulated:!0};case"host.status":return{transport:"worker-message-bus",nativeSockets:!1,services:9,simulated:!0};case"services.status":return k();default:throw new Error(`Unsupported Frameulator method: ${a}`)}}function B(a){if(typeof atob=="function"){let l=atob(a);return Uint8Array.from(l,u=>u.charCodeAt(0))}let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",s=a.replace(/=+$/,""),r=new Uint8Array(Math.floor(s.length*6/8)),t=0,i=0,c=0;for(let l of s){let u=e.indexOf(l);u<0||(t=t<<6|u,i+=6,i>=8&&(i-=8,r[c++]=t>>i&255))}return r}async function j(a){let e=await fetch(a);if(!e.ok)throw new Error(`Unable to load Frameulator WASM (${e.status}).`);return e.arrayBuffer()}async function U(a){let e=a.wasmBytes;if(!e&&a.wasmBase64&&(e=B(a.wasmBase64)),!e&&a.wasmUrl&&(e=await j(a.wasmUrl)),!e)throw new Error("No Frameulator WASM source was provided.");let s=e instanceof Uint8Array?e:new Uint8Array(e),i=(await WebAssembly.instantiate(s,{})).instance.exports;if(i.frameulator_abi_version()!==1)throw new Error("Unsupported Frameulator WASM ABI.");return i}var V=["IDLE","READY","SYNCHRONIZED","VISIBLE","FOCUSED","STOPPING","LOSS_PENDING","EXITING"],K={"tracking-lost":1,"tracking-restored":2,"runtime-exit":3,"focus-lost":4},y=class a{profile;wasm;world;lastReport;constructor(e,s){this.profile=e,this.wasm=s,this.world=A()}static async create(e={}){let r=!!(e.wasmBytes||e.wasmBase64||e.wasmUrl),t=await U({wasmBytes:e.wasmBytes,wasmBase64:e.wasmBase64||"",wasmUrl:r?e.wasmUrl:new URL("./frameulator.wasm",import.meta.url)});return t.frameulator_reset(),new a(I(e.profile),t)}get sessionState(){return V[this.wasm.frameulator_session_state()]??"IDLE"}get frameCount(){return Number(this.wasm.frameulator_frame_count())}get elapsedMilliseconds(){return Number(this.wasm.frameulator_elapsed_micros())/1e3}get snapshot(){return{sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,headPose:structuredClone(this.world.headPose),controllers:structuredClone(this.world.controllers),simulated:!0}}reset(){this.wasm.frameulator_reset(),this.world=A(),this.lastReport=void 0}start(){return this.wasm.frameulator_start(),this.sessionState}stop(){return this.wasm.frameulator_stop(),this.sessionState}step(e){if(!Number.isFinite(e)||e<0||e>1e3)throw new Error("Frame step must be between 0 and 1000 milliseconds.");return this.wasm.frameulator_step(Math.round(e*1e3)),this.world.compositorFrames+=1,this.sessionState}setHeadPose(e){this.world.headPose=structuredClone(e)}setControllerState(e,s){this.world.controllers[e]={...this.world.controllers[e],...structuredClone(s)}}injectEvent(e){return this.wasm.frameulator_inject_event(K[e]),e==="tracking-lost"&&(this.world.trackingAvailable=!1),e==="tracking-restored"&&(this.world.trackingAvailable=!0),this.sessionState}call(e){return N(e,this.profile,this.world)}async runScenario(e){let s=F(e),r=[];this.reset();for(let t of s.steps)switch(t.action){case"start":this.start();break;case"stop":this.stop();break;case"step":this.step(t.milliseconds);break;case"event":this.injectEvent(t.event);break;case"assert-state":{let i=this.sessionState;r.push({expected:t.state,actual:i,passed:i===t.state});break}}return this.lastReport={schemaVersion:2,frameulatorVersion:"0.2.0",scenario:s.id,profile:this.profile.id,simulated:!0,evidenceLevel:"F1-browser-wasm",passed:r.length>0&&r.every(t=>t.passed),sessionState:this.sessionState,frameCount:this.frameCount,elapsedMilliseconds:this.elapsedMilliseconds,assertions:r,services:k(),generatedAt:new Date().toISOString()},structuredClone(this.lastReport)}exportReport(){if(!this.lastReport)throw new Error("Run a scenario before exporting a report.");return structuredClone(this.lastReport)}};function n(a,e){if(!a)throw new Error(e)}function f(a){n(typeof a=="string"&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(a),"Invalid identifier")}function h(a,e=65536){let s=(t,i)=>{if(n(i<=16,"JSON depth limit exceeded"),!(t===null||typeof t=="string"||typeof t=="boolean")){if(typeof t=="number"){n(Number.isFinite(t),"JSON numbers must be finite");return}n(typeof t=="object"&&(Array.isArray(t)||Object.getPrototypeOf(t)===Object.prototype),"Plain JSON data required");for(let c of Object.values(t))s(c,i+1)}};s(a,0);let r=JSON.stringify(a);return n(r.length<=e,"JSON size limit exceeded"),JSON.parse(r)}function P(a){n(a&&Array.isArray(a.surfaces)&&a.surfaces.length<=4,"At most four surfaces supported");let e=new Set,s=0,r=a.surfaces.map(t=>(f(t.id),n(!e.has(t.id),"Duplicate surface"),e.add(t.id),n(Number.isSafeInteger(t.width)&&t.width>0&&t.width<=1024&&Number.isSafeInteger(t.height)&&t.height>0&&t.height<=1024,"Invalid surface dimensions"),n(t.rgba instanceof Uint8Array&&t.rgba.length===t.width*t.height*4,"Invalid RGBA buffer"),s+=t.rgba.length,n(s<=16*1024*1024,"Surface byte limit exceeded"),n(Number.isSafeInteger(t.revision)&&t.revision>=0,"Invalid surface revision"),n(t.visible===void 0||typeof t.visible=="boolean","Invalid visibility"),{id:t.id,width:t.width,height:t.height,rgba:t.rgba.slice(),revision:t.revision,...t.visible===void 0?{}:{visible:t.visible}}));return{data:h(a.data),surfaces:r}}var C={id:"neutral-panel",version:"1.0.0",source:{kind:"builtin",version:"0.3.0"},create(){let a=0,e=!1,s=!1,r=!1,t=()=>n(!s,"Sample disposed");return{start(){t(),e=!0},stop(){t(),e=!1,r=!1},reset(){t(),a=0,e=!1,r=!1},step(){t()},input(i){t(),n(e,"Sample not running"),i.phase==="down"&&(r=!0),i.phase==="up"&&(r&&a++,r=!1),i.phase==="cancel"&&(r=!1)},action(i){t(),n(e,"Sample not running"),n(i==="sample.advance","Unknown sample action"),a++},snapshot(){t();let i=256,c=160,l=new Uint8Array(i*c*4);for(let u=0;u<c;u++)for(let d=0;d<i;d++){let m=(u*i+d)*4,o=d>16&&d<240&&u>24&&u<136;l.set(o?[40+a*37%160,100+a*17%120,170,255]:[12,20,30,255],m)}return{data:{count:a,running:e},surfaces:[{id:"surface.main",width:i,height:c,rgba:l,revision:a,visible:!0}]}},dispose(){s=!0,e=!1,r=!1}}}};var W=new Uint32Array([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]);function p(a,e){return a>>>e|a<<32-e}var E=class{state=new Uint32Array([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]);buffer=new Uint8Array(64);words=new Uint32Array(64);bufferLength=0;bytesHashed=0;finished=!1;update(e){if(this.finished)throw new Error("SHA-256 digest has already been finalized.");this.bytesHashed+=e.byteLength;let s=0;for(;s<e.byteLength;){let r=Math.min(64-this.bufferLength,e.byteLength-s);this.buffer.set(e.subarray(s,s+r),this.bufferLength),this.bufferLength+=r,s+=r,this.bufferLength===64&&(this.compress(this.buffer),this.bufferLength=0)}return this}digestHex(){return Array.from(this.digest(),e=>e.toString(16).padStart(2,"0")).join("")}digest(){if(!this.finished){let r=Math.floor(this.bytesHashed/536870912),t=this.bytesHashed<<3>>>0;this.buffer[this.bufferLength++]=128,this.bufferLength>56&&(this.buffer.fill(0,this.bufferLength),this.compress(this.buffer),this.bufferLength=0),this.buffer.fill(0,this.bufferLength,56);let i=new DataView(this.buffer.buffer);i.setUint32(56,r,!1),i.setUint32(60,t,!1),this.compress(this.buffer),this.finished=!0}let e=new Uint8Array(32),s=new DataView(e.buffer);return this.state.forEach((r,t)=>s.setUint32(t*4,r,!1)),e}compress(e){let s=new DataView(e.buffer,e.byteOffset,e.byteLength);for(let o=0;o<16;o+=1)this.words[o]=s.getUint32(o*4,!1);for(let o=16;o<64;o+=1){let b=this.words[o-15],w=this.words[o-2],v=p(b,7)^p(b,18)^b>>>3,x=p(w,17)^p(w,19)^w>>>10;this.words[o]=this.words[o-16]+v+this.words[o-7]+x>>>0}let[r,t,i,c,l,u,d,m]=this.state;for(let o=0;o<64;o+=1){let b=p(l,6)^p(l,11)^p(l,25),w=l&u^~l&d,v=m+b+w+W[o]+this.words[o]>>>0,x=p(r,2)^p(r,13)^p(r,22),_=r&t^r&i^t&i,O=x+_>>>0;m=d,d=u,u=l,l=c+v>>>0,c=i,i=t,t=r,r=v+O>>>0}this.state[0]=this.state[0]+r>>>0,this.state[1]=this.state[1]+t>>>0,this.state[2]=this.state[2]+i>>>0,this.state[3]=this.state[3]+c>>>0,this.state[4]=this.state[4]+l>>>0,this.state[5]=this.state[5]+u>>>0,this.state[6]=this.state[6]+d>>>0,this.state[7]=this.state[7]+m>>>0}};function R(a){return new E().update(a).digestHex()}var S=class a{constructor(e,s){this.kernel=e;for(let r of[C,...s])f(r.id),n(!this.factories.has(r.id),"Duplicate adapter ID"),n(typeof r.create=="function","Adapter factory required"),n(/^\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?$/.test(r.version),"Invalid adapter version"),n(r.source&&(r.source.kind==="builtin"||r.source.kind==="source"),"Adapter source required"),r.source.kind==="source"&&n(typeof r.source.repository=="string"&&r.source.repository.length<=256&&/^[a-f0-9]{40}$/.test(r.source.commit),"Pinned adapter source required"),this.factories.set(r.id,r)}factories=new Map;adapter;selection;factory;state="EMPTY";closed=!1;queue=Promise.resolve();events=[];sequence=0;executed=!1;report;static async create(e={}){return new a(await y.create(e),e.adapters??[])}request(e,s){let r=s===void 0?void 0:structuredClone(s),t=this.queue.then(async()=>(n(!this.closed,"Application host destroyed"),await this.dispatch(e,r)));return this.queue=t.catch(()=>{}),t}active(){return n(this.adapter&&this.selection&&this.factory,"APPLICATION_REQUIRED: load a registered application"),this.adapter}async clear(){let e=this.adapter;this.adapter=void 0,this.selection=void 0,this.factory=void 0,this.state="EMPTY",this.executed=!1,this.report=void 0,this.events=[],this.sequence=0,this.kernel.reset(),await e?.dispose()}record(e,s){this.events.push({sequence:++this.sequence,method:e,...s===void 0?{}:{parameters:h(s,4096)}}),this.events.length>256&&this.events.shift(),this.report=void 0}async snapshot(){let e=this.kernel.snapshot,s;return this.adapter&&this.selection&&this.factory&&(s={...P(await this.adapter.snapshot()),state:this.state,descriptor:structuredClone(this.selection.manifest),adapterId:this.factory.id,adapterVersion:this.factory.version,source:structuredClone(this.factory.source)}),{...e,application:s,applicationFrame:s?{data:s.data,surfaces:s.surfaces}:void 0}}async dispatch(e,s){switch(["snapshot","exportReport"].includes(e)||(this.report=void 0),e){case"snapshot":return this.snapshot();case"loadApplication":{await this.clear();try{let r=h(s);f(r.adapterId),n(r.manifest&&typeof r.manifest=="object","Manifest required"),f(r.manifest.id),n(typeof r.manifest.name=="string"&&r.manifest.name.length>0&&r.manifest.name.length<=200,"Invalid application name"),n(/^\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?$/.test(r.manifest.version),"Invalid application version");let t=this.factories.get(r.adapterId);n(t,"Unknown adapter: arbitrary code loading is disabled");let i=await t.create({manifest:structuredClone(r.manifest),config:r.config??{}});this.adapter=i;for(let c of["start","stop","reset","step","input","snapshot","dispose"])n(typeof i[c]=="function",`Adapter missing ${c}`);return this.selection=r,this.factory=t,this.state="READY",this.record(e),await this.snapshot()}catch(r){try{await this.clear()}finally{this.state="FAILED"}throw r}}case"removeApplication":return await this.clear(),this.snapshot();case"start":{let r=this.active();n(this.state==="READY"||this.state==="STOPPED","Application is not ready to start");try{return await r.start(),this.kernel.start(),this.state="RUNNING",this.executed=!0,this.record(e),await this.snapshot()}catch(t){throw this.state="FAILED",t}}case"stop":{let r=this.active();n(this.state==="RUNNING","Application is not running");try{return await r.stop(),this.kernel.stop(),this.kernel.step(0),this.state="STOPPED",this.record(e),await this.snapshot()}catch(t){throw this.state="FAILED",t}}case"reset":{let r=this.active();try{return await r.reset(),this.kernel.reset(),this.state="READY",this.executed=!1,this.record(e),await this.snapshot()}catch(t){throw this.state="FAILED",t}}case"step":{let r=this.active();n(this.state==="RUNNING","Application is not running"),n(Number.isFinite(s)&&s>=0&&s<=1e3,"Frame step must be between 0 and 1000 milliseconds");try{return await r.step(s),this.kernel.step(s),this.record(e,s),await this.snapshot()}catch(t){throw this.state="FAILED",t}}case"input":{let r=this.active();n(this.state==="RUNNING","Application is not running");let t=h(s,4096);n(t.type==="pointer"&&["down","move","up","cancel"].includes(t.phase),"Unsupported input"),f(t.surfaceId),n(Number.isFinite(t.x)&&t.x>=0&&t.x<=1&&Number.isFinite(t.y)&&t.y>=0&&t.y<=1&&Number.isSafeInteger(t.button)&&t.button>=0&&t.button<=5,"Invalid pointer coordinates/button");let i=P(await r.snapshot());return n(i.surfaces.some(c=>c.id===t.surfaceId&&c.visible!==!1),"Unknown or hidden input surface"),await r.input(t),this.record(e,t),this.snapshot()}case"action":{let r=this.active();n(this.state==="RUNNING","Application is not running");let t=h(s,4096);return f(t.name),n(r.action,"Actions unsupported by this adapter"),await r.action(t.name,t.payload??{}),this.record(e,t),this.snapshot()}case"setHeadPose":return this.kernel.setHeadPose(s),this.snapshot();case"setControllerState":return n(s.hand==="left"||s.hand==="right","Invalid controller"),this.kernel.setControllerState(s.hand,s.state),this.snapshot();case"injectEvent":return n(["tracking-lost","tracking-restored","runtime-exit","focus-lost"].includes(s),"Unknown host event"),this.kernel.injectEvent(s),this.record(e),this.snapshot();case"runScenario":{this.active();let r=await this.kernel.runScenario(s);return this.report=await this.makeReport(r.scenario,r),structuredClone(this.report)}case"exportReport":return this.report?structuredClone(this.report):this.makeReport("interactive");case"destroy":try{await this.clear()}finally{this.closed=!0}return{destroyed:!0};default:return this.kernel.call(e)}}async makeReport(e,s){let r=await this.snapshot(),t=r.application;return{schemaVersion:3,frameulatorVersion:"0.3.0",scenario:e,profile:this.kernel.profile.id,simulated:!0,evidenceLevel:"F1-browser-wasm",passed:!!(s?.passed&&this.state!=="FAILED"),generatedAt:new Date().toISOString(),hostKernelExecuted:!0,applicationExecuted:this.executed,applicationAssertionsChecked:!1,nativeExecutionProven:!1,hardwareProven:!1,host:s,application:t?{appId:t.descriptor.id,version:t.descriptor.version,adapterId:t.adapterId,adapterVersion:t.adapterVersion,source:t.source,executionMode:"trusted-js-adapter",trust:"host-injected",signatureVerified:!1,state:t.state,manifestSha256:R(new TextEncoder().encode(JSON.stringify(this.selection.manifest))),config:structuredClone(this.selection.config??{}),data:t.data,surfaces:t.surfaces.map(i=>({id:i.id,width:i.width,height:i.height,revision:i.revision,sha256:R(i.rgba)}))}:void 0,events:structuredClone(this.events)}}destroy(){return this.request("destroy")}};var g,L=Promise.resolve();self.addEventListener("message",a=>{let e=a.data;L=L.then(async()=>{let s={protocol:"frameulator/2",requestId:e?.requestId,ok:!0};try{if(e?.protocol!=="frameulator/2"||!Number.isSafeInteger(e.requestId)||typeof e.method!="string")throw Error("Invalid Frameulator Worker request");if(e.method==="initialize"){if(g)throw Error("Already initialized");g=await S.create(e.parameters??{}),s.result=await g.request("snapshot")}else{if(!g)throw Error("Worker not initialized");s.result=await g.request(e.method,e.parameters)}}catch(r){s.ok=!1,s.error=r instanceof Error?r.message:String(r)}self.postMessage(s)}).catch(()=>{})});\n'], {
        type: "text/javascript"
      });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl, { name: "frameulator", type: "module" });
    }
    const client = new _WorkerClient(worker, blobUrl);
    const embedded = "";
    const hasExplicitSource = Boolean(
      options.wasmBytes || options.wasmBase64 || options.wasmUrl
    );
    try {
      await client.request("initialize", {
        profile: options.profile,
        wasmBytes: options.wasmBytes,
        wasmBase64: options.wasmBase64 || embedded,
        wasmUrl: hasExplicitSource || embedded ? options.wasmUrl : new URL("./frameulator.wasm", import.meta.url).href
      });
    } catch (error) {
      client.destroy();
      throw error;
    }
    return client;
  }
  request(method, parameters) {
    if (this.destroyed)
      return Promise.reject(new Error("Frameulator Worker was destroyed."));
    const requestId = ++this.requestId;
    const request = {
      protocol: "frameulator/2",
      requestId,
      method,
      parameters
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Frameulator request timed out: ${method}`));
      }, 1e4);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.worker.postMessage(request);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.failAll(new Error("Frameulator Worker was destroyed."));
    this.worker.terminate();
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = void 0;
  }
  receive(response) {
    if (response.protocol !== "frameulator/2") {
      this.failAll(
        new Error(
          "Frameulator Worker protocol mismatch; version 2 is required."
        )
      );
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.result);
    else
      pending.reject(
        new Error(response.error ?? "Unknown Frameulator Worker error.")
      );
  }
  failAll(error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
};

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

// packages/frameulator/src/application/contracts.ts
function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
function identifier(value) {
  ensure(
    typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value),
    "Invalid identifier"
  );
}
function boundedJson(value, maximum = 65536) {
  const visit = (x, depth) => {
    ensure(depth <= 16, "JSON depth limit exceeded");
    if (x === null || typeof x === "string" || typeof x === "boolean") return;
    if (typeof x === "number") {
      ensure(Number.isFinite(x), "JSON numbers must be finite");
      return;
    }
    ensure(
      typeof x === "object" && (Array.isArray(x) || Object.getPrototypeOf(x) === Object.prototype),
      "Plain JSON data required"
    );
    for (const v of Object.values(x)) visit(v, depth + 1);
  };
  visit(value, 0);
  const text = JSON.stringify(value);
  ensure(text.length <= maximum, "JSON size limit exceeded");
  return JSON.parse(text);
}
function validateSnapshot(value) {
  ensure(
    value && Array.isArray(value.surfaces) && value.surfaces.length <= 4,
    "At most four surfaces supported"
  );
  const ids = /* @__PURE__ */ new Set();
  let bytes = 0;
  const surfaces = value.surfaces.map((s) => {
    identifier(s.id);
    ensure(!ids.has(s.id), "Duplicate surface");
    ids.add(s.id);
    ensure(
      Number.isSafeInteger(s.width) && s.width > 0 && s.width <= 1024 && Number.isSafeInteger(s.height) && s.height > 0 && s.height <= 1024,
      "Invalid surface dimensions"
    );
    ensure(
      s.rgba instanceof Uint8Array && s.rgba.length === s.width * s.height * 4,
      "Invalid RGBA buffer"
    );
    bytes += s.rgba.length;
    ensure(bytes <= 16 * 1024 * 1024, "Surface byte limit exceeded");
    ensure(
      Number.isSafeInteger(s.revision) && s.revision >= 0,
      "Invalid surface revision"
    );
    ensure(
      s.visible === void 0 || typeof s.visible === "boolean",
      "Invalid visibility"
    );
    return {
      id: s.id,
      width: s.width,
      height: s.height,
      rgba: s.rgba.slice(),
      revision: s.revision,
      ...s.visible === void 0 ? {} : { visible: s.visible }
    };
  });
  return { data: boundedJson(value.data), surfaces };
}

// packages/frameulator/src/application/NeutralPanel.ts
var NeutralPanelAdapter = {
  id: "neutral-panel",
  version: "1.0.0",
  source: { kind: "builtin", version: "0.3.0" },
  create() {
    let count = 0, running = false, closed = false, down = false;
    const live = () => ensure(!closed, "Sample disposed");
    return {
      start() {
        live();
        running = true;
      },
      stop() {
        live();
        running = false;
        down = false;
      },
      reset() {
        live();
        count = 0;
        running = false;
        down = false;
      },
      step() {
        live();
      },
      input(e) {
        live();
        ensure(running, "Sample not running");
        if (e.phase === "down") down = true;
        if (e.phase === "up") {
          if (down) count++;
          down = false;
        }
        if (e.phase === "cancel") down = false;
      },
      action(name) {
        live();
        ensure(running, "Sample not running");
        ensure(name === "sample.advance", "Unknown sample action");
        count++;
      },
      snapshot() {
        live();
        const width = 256, height = 160, rgba = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4, inside = x > 16 && x < 240 && y > 24 && y < 136;
            rgba.set(
              inside ? [
                40 + count * 37 % 160,
                100 + count * 17 % 120,
                170,
                255
              ] : [12, 20, 30, 255],
              i
            );
          }
        return {
          data: { count, running },
          surfaces: [
            {
              id: "surface.main",
              width,
              height,
              rgba,
              revision: count,
              visible: true
            }
          ]
        };
      },
      dispose() {
        closed = true;
        running = false;
        down = false;
      }
    };
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

// packages/frameulator/src/application/ApplicationHost.ts
var ApplicationHost = class _ApplicationHost {
  constructor(kernel, adapters) {
    this.kernel = kernel;
    for (const factory of [NeutralPanelAdapter, ...adapters]) {
      identifier(factory.id);
      ensure(!this.factories.has(factory.id), "Duplicate adapter ID");
      ensure(typeof factory.create === "function", "Adapter factory required");
      ensure(
        /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(factory.version),
        "Invalid adapter version"
      );
      ensure(
        factory.source && (factory.source.kind === "builtin" || factory.source.kind === "source"),
        "Adapter source required"
      );
      if (factory.source.kind === "source")
        ensure(
          typeof factory.source.repository === "string" && factory.source.repository.length <= 256 && /^[a-f0-9]{40}$/.test(factory.source.commit),
          "Pinned adapter source required"
        );
      this.factories.set(factory.id, factory);
    }
  }
  factories = /* @__PURE__ */ new Map();
  adapter;
  selection;
  factory;
  state = "EMPTY";
  closed = false;
  queue = Promise.resolve();
  events = [];
  sequence = 0;
  executed = false;
  report;
  static async create(options = {}) {
    return new _ApplicationHost(
      await FrameulatorKernel.create(options),
      options.adapters ?? []
    );
  }
  request(method, parameters) {
    const input = parameters === void 0 ? void 0 : structuredClone(parameters);
    const job = this.queue.then(async () => {
      ensure(!this.closed, "Application host destroyed");
      const result = await this.dispatch(method, input);
      return result;
    });
    this.queue = job.catch(() => {
    });
    return job;
  }
  active() {
    ensure(
      this.adapter && this.selection && this.factory,
      "APPLICATION_REQUIRED: load a registered application"
    );
    return this.adapter;
  }
  async clear() {
    const old = this.adapter;
    this.adapter = void 0;
    this.selection = void 0;
    this.factory = void 0;
    this.state = "EMPTY";
    this.executed = false;
    this.report = void 0;
    this.events = [];
    this.sequence = 0;
    this.kernel.reset();
    await old?.dispose();
  }
  record(method, parameters) {
    this.events.push({
      sequence: ++this.sequence,
      method,
      ...parameters === void 0 ? {} : { parameters: boundedJson(parameters, 4096) }
    });
    if (this.events.length > 256) this.events.shift();
    this.report = void 0;
  }
  async snapshot() {
    const base = this.kernel.snapshot;
    let application;
    if (this.adapter && this.selection && this.factory) {
      const frame = validateSnapshot(await this.adapter.snapshot());
      application = {
        ...frame,
        state: this.state,
        descriptor: structuredClone(this.selection.manifest),
        adapterId: this.factory.id,
        adapterVersion: this.factory.version,
        source: structuredClone(this.factory.source)
      };
    }
    return {
      ...base,
      application,
      applicationFrame: application ? { data: application.data, surfaces: application.surfaces } : void 0
    };
  }
  async dispatch(method, p) {
    if (!["snapshot", "exportReport"].includes(method)) this.report = void 0;
    switch (method) {
      case "snapshot":
        return this.snapshot();
      case "loadApplication": {
        await this.clear();
        try {
          const selection = boundedJson(p);
          identifier(selection.adapterId);
          ensure(
            selection.manifest && typeof selection.manifest === "object",
            "Manifest required"
          );
          identifier(selection.manifest.id);
          ensure(
            typeof selection.manifest.name === "string" && selection.manifest.name.length > 0 && selection.manifest.name.length <= 200,
            "Invalid application name"
          );
          ensure(
            /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(selection.manifest.version),
            "Invalid application version"
          );
          const factory = this.factories.get(selection.adapterId);
          ensure(
            factory,
            "Unknown adapter: arbitrary code loading is disabled"
          );
          const adapter = await factory.create({
            manifest: structuredClone(selection.manifest),
            config: selection.config ?? {}
          });
          this.adapter = adapter;
          for (const name of [
            "start",
            "stop",
            "reset",
            "step",
            "input",
            "snapshot",
            "dispose"
          ])
            ensure(
              typeof adapter[name] === "function",
              `Adapter missing ${name}`
            );
          this.selection = selection;
          this.factory = factory;
          this.state = "READY";
          this.record(method);
          return await this.snapshot();
        } catch (error) {
          try {
            await this.clear();
          } finally {
            this.state = "FAILED";
          }
          throw error;
        }
      }
      case "removeApplication":
        await this.clear();
        return this.snapshot();
      case "start": {
        const adapter = this.active();
        ensure(
          this.state === "READY" || this.state === "STOPPED",
          "Application is not ready to start"
        );
        try {
          await adapter.start();
          this.kernel.start();
          this.state = "RUNNING";
          this.executed = true;
          this.record(method);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "stop": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        try {
          await adapter.stop();
          this.kernel.stop();
          this.kernel.step(0);
          this.state = "STOPPED";
          this.record(method);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "reset": {
        const adapter = this.active();
        try {
          await adapter.reset();
          this.kernel.reset();
          this.state = "READY";
          this.executed = false;
          this.record(method);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "step": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        ensure(
          Number.isFinite(p) && p >= 0 && p <= 1e3,
          "Frame step must be between 0 and 1000 milliseconds"
        );
        try {
          await adapter.step(p);
          this.kernel.step(p);
          this.record(method, p);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "input": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        const e = boundedJson(p, 4096);
        ensure(
          e.type === "pointer" && ["down", "move", "up", "cancel"].includes(e.phase),
          "Unsupported input"
        );
        identifier(e.surfaceId);
        ensure(
          Number.isFinite(e.x) && e.x >= 0 && e.x <= 1 && Number.isFinite(e.y) && e.y >= 0 && e.y <= 1 && Number.isSafeInteger(e.button) && e.button >= 0 && e.button <= 5,
          "Invalid pointer coordinates/button"
        );
        const snapshot = validateSnapshot(await adapter.snapshot());
        ensure(
          snapshot.surfaces.some(
            (s) => s.id === e.surfaceId && s.visible !== false
          ),
          "Unknown or hidden input surface"
        );
        await adapter.input(e);
        this.record(method, e);
        return this.snapshot();
      }
      case "action": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        const args = boundedJson(p, 4096);
        identifier(args.name);
        ensure(adapter.action, "Actions unsupported by this adapter");
        await adapter.action(args.name, args.payload ?? {});
        this.record(method, args);
        return this.snapshot();
      }
      case "setHeadPose":
        this.kernel.setHeadPose(p);
        return this.snapshot();
      case "setControllerState":
        ensure(p.hand === "left" || p.hand === "right", "Invalid controller");
        this.kernel.setControllerState(p.hand, p.state);
        return this.snapshot();
      case "injectEvent":
        ensure(
          [
            "tracking-lost",
            "tracking-restored",
            "runtime-exit",
            "focus-lost"
          ].includes(p),
          "Unknown host event"
        );
        this.kernel.injectEvent(p);
        this.record(method);
        return this.snapshot();
      case "runScenario": {
        this.active();
        const host = await this.kernel.runScenario(p);
        this.report = await this.makeReport(host.scenario, host);
        return structuredClone(this.report);
      }
      case "exportReport":
        return this.report ? structuredClone(this.report) : this.makeReport("interactive");
      case "destroy":
        try {
          await this.clear();
        } finally {
          this.closed = true;
        }
        return { destroyed: true };
      default:
        return this.kernel.call(method);
    }
  }
  async makeReport(scenario, host) {
    const snapshot = await this.snapshot(), app = snapshot.application;
    return {
      schemaVersion: 3,
      frameulatorVersion: "0.3.0",
      scenario,
      profile: this.kernel.profile.id,
      simulated: true,
      evidenceLevel: "F1-browser-wasm",
      passed: Boolean(host?.passed && this.state !== "FAILED"),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      hostKernelExecuted: true,
      applicationExecuted: this.executed,
      applicationAssertionsChecked: false,
      nativeExecutionProven: false,
      hardwareProven: false,
      host,
      application: app ? {
        appId: app.descriptor.id,
        version: app.descriptor.version,
        adapterId: app.adapterId,
        adapterVersion: app.adapterVersion,
        source: app.source,
        executionMode: "trusted-js-adapter",
        trust: "host-injected",
        signatureVerified: false,
        state: app.state,
        manifestSha256: sha256Bytes(
          new TextEncoder().encode(
            JSON.stringify(this.selection.manifest)
          )
        ),
        config: structuredClone(this.selection.config ?? {}),
        data: app.data,
        surfaces: app.surfaces.map((s) => ({
          id: s.id,
          width: s.width,
          height: s.height,
          revision: s.revision,
          sha256: sha256Bytes(s.rgba)
        }))
      } : void 0,
      events: structuredClone(this.events)
    };
  }
  destroy() {
    return this.request("destroy");
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
  async clearReport() {
    this.report = void 0;
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
    if (!("indexedDB" in globalThis))
      throw new Error("IndexedDB is not available in this environment.");
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("frameulator", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("reports")) {
          request.result.createObjectStore("reports");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error ?? new Error("Unable to open Frameulator storage.")
      );
    });
    return new _IndexedDbReportStore(database);
  }
  async save(report) {
    await this.transaction(
      "readwrite",
      (store) => store.put(structuredClone(report), "latest")
    );
  }
  async latest() {
    return this.transaction("readonly", (store) => store.get("latest"));
  }
  async clearReport() {
    await this.transaction("readwrite", (store) => store.delete("latest"));
  }
  async clear() {
    await Promise.all([
      this.transaction("readwrite", (store) => store.delete("latest")),
      this.transaction("readwrite", (store) => store.delete("latest-native"))
    ]);
  }
  async saveNative(evidence) {
    await this.transaction(
      "readwrite",
      (store) => store.put(structuredClone(evidence), "latest-native")
    );
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
      request.onerror = () => reject(
        request.error ?? new Error("Frameulator storage request failed.")
      );
    });
  }
};

// packages/frameulator/src/Frameulator.ts
var Frameulator = class _Frameulator extends EventTarget {
  constructor(transport, store) {
    super();
    this.transport = transport;
    this.store = store;
  }
  version = "0.3.0";
  simulated = true;
  renderer;
  frame = 0;
  previous = 0;
  running = false;
  closed = false;
  _state = "EMPTY";
  applicationLabel = "";
  generation = 0;
  reportEpoch = 0;
  static async create(options = {}) {
    ensure(
      !options.network || options.network === "disabled",
      "Application networking is disabled"
    );
    const useWorker = options.worker !== false && typeof Worker !== "undefined";
    ensure(
      !(useWorker && options.adapters?.length),
      "Injected adapters require worker:false; Worker adapters must be bundled explicitly"
    );
    const transport = useWorker ? await WorkerClient.create(options) : await ApplicationHost.create(options);
    let store = new MemoryReportStore();
    if (options.storage !== "memory" && typeof indexedDB !== "undefined") {
      try {
        store = await IndexedDbReportStore.create();
      } catch {
      }
    }
    const lab = new _Frameulator(transport, store);
    if (options.container && options.renderer !== "none") {
      try {
        lab.renderer = new FrameulatorRenderer(options.container);
        lab.renderer.setInputHandler((event) => {
          if (lab.applicationState !== "RUNNING") return;
          void lab.input(event).catch(
            (error) => lab.emit("frameulator-error", { message: String(error) })
          );
        });
      } catch (error) {
        await lab.destroy();
        throw error;
      }
    }
    return lab;
  }
  get applicationState() {
    return this._state;
  }
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  update(snapshot) {
    const previous = this._state;
    this._state = snapshot.application?.state ?? "EMPTY";
    const label = snapshot.application?.descriptor.name ?? "No application loaded";
    this.renderer?.update(snapshot);
    if (!snapshot.application) this.renderer?.clearApplicationFrame();
    if (previous !== this._state || label !== this.applicationLabel) {
      this.applicationLabel = label;
      this.emit("frameulator-application", {
        state: this._state,
        detail: label
      });
    }
    this.emit("frameulator-frame", snapshot);
    return snapshot;
  }
  async call(method, p) {
    ensure(!this.closed, "Frameulator destroyed");
    if (method !== "snapshot") {
      this.reportEpoch++;
      await this.store.clearReport();
    }
    try {
      return this.update(await this.transport.request(method, p));
    } catch (error) {
      if (method === "loadApplication") {
        this._state = "FAILED";
        this.renderer?.clearApplicationFrame();
        this.emit("frameulator-application", {
          state: "FAILED",
          detail: String(error)
        });
      }
      if (method !== "loadApplication" && method !== "snapshot") {
        try {
          this.update(await this.transport.request("snapshot"));
        } catch {
          this._state = "FAILED";
          this.renderer?.clearApplicationFrame();
        }
      }
      throw error;
    }
  }
  async loadApplication(selection) {
    this.pauseClock();
    this.renderer?.clearApplicationFrame();
    await this.store.clear();
    return this.call("loadApplication", selection);
  }
  async start() {
    const generation = this.generation;
    const result = await this.call("start");
    if (generation === this.generation && !this.closed) {
      this.running = true;
      this.previous = 0;
      this.schedule();
    }
    return result;
  }
  async stop() {
    this.pauseClock();
    return this.call("stop");
  }
  async reset() {
    this.pauseClock();
    this.renderer?.clearApplicationFrame();
    await this.store.clear();
    return this.call("reset");
  }
  async removeApplication() {
    this.pauseClock();
    await this.store.clear();
    return this.call("removeApplication");
  }
  async step(milliseconds) {
    return this.call("step", milliseconds);
  }
  async input(event) {
    return this.call("input", event);
  }
  async action(name, payload = {}) {
    return this.call("action", { name, payload });
  }
  async snapshot() {
    return this.call("snapshot");
  }
  async setHeadPose(pose) {
    return this.call("setHeadPose", pose);
  }
  async setControllerState(hand, state) {
    return this.call("setControllerState", { hand, state });
  }
  async injectEvent(event) {
    return this.call("injectEvent", event);
  }
  async runScenario(scenario) {
    ensure(!this.closed, "Frameulator destroyed");
    this.pauseClock();
    const epoch = ++this.reportEpoch;
    await this.store.clearReport();
    const report = await this.transport.request("runScenario", scenario);
    if (epoch === this.reportEpoch) await this.store.save(report);
    return report;
  }
  async exportReport() {
    ensure(!this.closed, "Frameulator destroyed");
    const epoch = this.reportEpoch;
    await this.store.clearReport();
    const report = await this.transport.request("exportReport");
    if (epoch === this.reportEpoch) await this.store.save(report);
    return report;
  }
  async latestReport() {
    const report = await this.store.latest();
    return report?.schemaVersion === 3 ? report : void 0;
  }
  async importEvidence(value) {
    const e = boundedJson(value);
    ensure(
      e.simulated === false && [
        "F3-native-vulkan",
        "F4-native-openxr",
        "F5-arm64-flatpak",
        "F6-device"
      ].includes(e.evidenceLevel) && typeof e.producer === "string" && e.producer.length > 0 && typeof e.scenario === "string" && typeof e.passed === "boolean" && Number.isFinite(Date.parse(e.generatedAt)),
      "Invalid native evidence"
    );
    await this.store.saveNative(e);
    return e;
  }
  async latestNativeEvidence() {
    return this.store.latestNative();
  }
  compareEvidence({
    simulation,
    native
  }) {
    const sameScenario = simulation.scenario === native.scenario;
    return {
      comparable: sameScenario,
      sameScenario,
      simulationPassed: simulation.passed,
      nativePassed: native.passed,
      simulationLevel: simulation.evidenceLevel,
      nativeLevel: native.evidenceLevel,
      note: "Imported evidence is separate; browser simulation does not establish native execution."
    };
  }
  setEyePreviews(left, right) {
    this.renderer?.setEyePreviews(left, right);
  }
  pauseClock() {
    this.generation++;
    this.running = false;
    if (typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  schedule() {
    if (this.running && !this.closed && typeof requestAnimationFrame === "function")
      this.frame = requestAnimationFrame(async (time) => {
        if (!this.running || this.closed) return;
        const delta = this.previous ? Math.min(1e3, Math.max(0, time - this.previous)) : 0;
        this.previous = time;
        try {
          await this.step(delta);
        } catch (error) {
          this.pauseClock();
          this.emit("frameulator-error", { message: String(error) });
        }
        this.schedule();
      });
  }
  async destroy() {
    if (this.closed) return;
    this.pauseClock();
    try {
      await this.transport.request("destroy");
    } finally {
      this.closed = true;
      if (this.transport instanceof WorkerClient) this.transport.destroy();
      this.renderer?.destroy();
      this.store.close();
    }
  }
};

// packages/frameulator/src/styles.css
var styles_default = ':host {\n  --bg: #080e13;\n  --panel: #0d151d;\n  --line: #23313d;\n  --mint: #a5e9d7;\n  --text: #eaf0f4;\n  --muted: #96a6b4;\n  display: block;\n  width: 100%;\n  height: 100%;\n  min-width: 320px;\n  color: var(--text);\n  background: var(--bg);\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n  font-size: 14px;\n}\n* { box-sizing: border-box; }\n[hidden] { display: none !important; }\nbutton { min-height: 40px; padding: 0 14px; border: 1px solid #334553; border-radius: 6px; color: #d8e2ea; background: #14212c; font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1.25; cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }\nbutton:hover:not(:disabled) { border-color: #769b9f; background: #1f3240; }\nbutton:focus-visible, canvas:focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; }\nbutton:disabled { opacity: 0.38; cursor: not-allowed; }\nbutton.primary { color: #122c27; border-color: var(--mint); background: var(--mint); font-weight: 750; }\nbutton.primary:hover:not(:disabled) { background: #c6f5e9; }\nh1, h2, h3, p { margin-top: 0; }\n.frameulator-shell { display: grid; grid-template-rows: 76px minmax(0, 1fr) 34px; width: 100%; height: 100%; min-height: 520px; overflow: hidden; }\n.frameulator-topbar { display: flex; align-items: center; gap: 22px; min-width: 0; padding: 0 26px; border-bottom: 1px solid var(--line); background: #0c131a; }\n.frameulator-brand { display: flex; align-items: center; gap: 11px; flex: none; }\n.frameulator-brand strong { display: block; font-size: 18px; font-weight: 650; letter-spacing: -0.6px; }\n.frameulator-brand small { display: block; margin-top: 4px; color: #7f929f; font: 9px ui-monospace, monospace; letter-spacing: 1.35px; }\n.frameulator-mark { display: grid; place-items: center; width: 37px; height: 37px; color: var(--mint); border: 1px solid #4d716c; border-radius: 10px; background: #152822; font: 650 22px ui-monospace, monospace; }\n.simulation-badge { color: #8495a3; font: 9px ui-monospace, monospace; letter-spacing: 1px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 4px; }\n.frameulator-global-actions { display: flex; gap: 8px; margin-left: auto; }\n.frameulator-main { display: grid; grid-template-columns: minmax(0, 1fr) 342px; min-height: 0; overflow: hidden; }\n.frameulator-visuals { display: grid; grid-template-rows: 80px minmax(210px, 1fr) minmax(178px, 0.55fr); gap: 0; min-height: 0; padding: 0 26px 22px; overflow: auto; }\n.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }\n.eyebrow { display: block; color: #8195a5; font: 9px ui-monospace, monospace; letter-spacing: 1.2px; }\n.section-heading h1 { margin: 6px 0 0; font-size: 21px; font-weight: 540; letter-spacing: -0.6px; }\n.state-chip { padding: 5px 8px; border: 1px solid #36584f; border-radius: 4px; color: #aadccf; background: #152620; font: 600 10px ui-monospace, monospace; }\n.frameulator-stage { position: relative; min-height: 210px; overflow: hidden; border: 1px solid #293e4c; border-radius: 9px; background: radial-gradient(ellipse at 50% 40%, #19303a, #080e13 75%); }\n.frameulator-stage > canvas { display: block; width: 100%; height: 100%; }\n.frameulator-viewport-hud { pointer-events: none; position: absolute; z-index: 2; top: 13px; right: 14px; left: 14px; display: flex; justify-content: space-between; gap: 8px; color: #7997a6; font: 8px ui-monospace, monospace; letter-spacing: 0.8px; }\n.frameulator-viewport-hud span { padding: 5px 6px; background: #0b151cbf; border-radius: 3px; }\n.frameulator-empty { position: absolute; z-index: 3; top: 44%; left: 50%; width: min(350px, calc(100% - 28px)); padding: 19px 20px 22px; transform: translate(-50%, -50%); border: 1px solid #344957; border-radius: 9px; background: #0b151be8; box-shadow: 0 14px 40px #0005; text-align: center; backdrop-filter: blur(10px); }\n.empty-symbol { display: block; width: 28px; height: 28px; margin: 0 auto 10px; border: 1px solid #3c665c; border-radius: 8px; color: var(--mint); font-size: 19px; }\n.frameulator-empty h2 { margin-bottom: 8px; color: #eaf2f5; font-size: 18px; font-weight: 560; letter-spacing: -0.3px; }\n.frameulator-empty p { max-width: 280px; margin: 0 auto 15px; color: #9bb0bb; font-size: 12px; line-height: 1.6; }\n.frameulator-eye-dock { pointer-events: none; position: absolute; z-index: 2; right: 12px; bottom: 12px; display: flex; gap: 7px; }\n.frameulator-eye-dock figure { position: relative; width: 98px; margin: 0; overflow: hidden; border: 1px solid #35444f; border-radius: 5px; background: #080e13; }\n.frameulator-eye-dock canvas { display: block; width: 100%; height: 58px; object-fit: cover; }\n.frameulator-eye-dock figcaption { padding: 4px 5px; color: #a0b1bd; border-top: 1px solid #22303b; font: 7px ui-monospace, monospace; letter-spacing: 0.3px; }\n.frameulator-stage[data-renderer="unavailable"] .frameulator-eye-dock { display: none; }\n.frameulator-surfaces { display: flex; flex-direction: column; min-height: 178px; padding-top: 21px; }\n.surface-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }\n.surface-heading h2 { margin: 5px 0 0; font-size: 15px; font-weight: 550; letter-spacing: -0.2px; }\n.surface-heading h2 span { display: inline-flex; align-items: center; justify-content: center; min-width: 19px; margin-left: 5px; padding: 2px 4px; border: 1px solid #35444f; border-radius: 4px; color: #91a6b4; font: 10px ui-monospace, monospace; }\n.surface-help { color: #6e8595; font: 8px ui-monospace, monospace; letter-spacing: 0.7px; }\n.surface-placeholder { display: grid; place-items: center; flex: 1; min-height: 67px; padding: 20px; margin-bottom: 0; border: 1px dashed #2d404d; border-radius: 6px; color: #8b9dab; font-size: 12px; text-align: center; }\n.surface-list { display: flex; align-items: flex-start; gap: 12px; flex: 1; min-height: 0; overflow: auto; }\n.surface-list:empty { display: none; }\n.surface-card { flex: 0 0 auto; max-width: 100%; margin: 0; overflow: hidden; border: 1px solid #39515e; border-radius: 6px; background: repeating-conic-gradient(#24313b 0% 25%, #18232c 0% 50%) 50% / 14px 14px; }\n.surface-card canvas { display: block; width: auto; height: 100px; max-width: 100%; object-fit: contain; touch-action: none; cursor: crosshair; image-rendering: pixelated; }\n.surface-card figcaption { padding: 6px 9px; color: #a1b6c2; background: #101c26; font: 9px ui-monospace, monospace; white-space: nowrap; }\n.pixel-readout { display: block; margin-top: 9px; color: #6e8695; font: 9px/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }\n.frameulator-inspector { display: grid; grid-template-rows: 80px 45px minmax(0, 1fr) 42px; min-width: 0; min-height: 0; border-left: 1px solid var(--line); background: var(--panel); }\n.frameulator-inspector > header { display: flex; align-items: center; justify-content: space-between; gap: 9px; padding: 17px 20px; }\n.frameulator-inspector h2 { margin: 6px 0 0; font-size: 17px; font-weight: 550; letter-spacing: -0.3px; overflow-wrap: anywhere; }\n.frameulator-tabs { display: grid; grid-template-columns: repeat(4, 1fr); padding: 0 14px; border-top: 1px solid #1b2a35; border-bottom: 1px solid #263844; }\n.frameulator-tabs button { min-height: 44px; padding: 0 5px; border: 0; border-radius: 0; color: #7e94a5; background: transparent; font-size: 11px; }\n.frameulator-tabs button[aria-selected="true"] { color: var(--mint); box-shadow: inset 0 -2px var(--mint); }\n.frameulator-inspector-body { min-height: 0; overflow: auto; }\n.frameulator-inspector-body > section { padding: 20px; }\n.section-note { margin-bottom: 17px; color: #92a5b4; font-size: 12px; line-height: 1.7; }\ndl { margin: 0 0 18px; }\ndl div { display: grid; grid-template-columns: minmax(95px, 1fr) minmax(0, 1fr); align-items: start; gap: 8px; padding: 12px 0; border-bottom: 1px solid #21313d; }\ndt { color: #8095a5; font-size: 11px; }\ndd { margin: 0; color: #c7d6e0; font: 11px/1.4 ui-monospace, monospace; text-align: right; overflow-wrap: anywhere; }\n.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n.sample-action { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; margin-top: 8px; color: #a8d8ca; border-color: #315148; background: #152922; }\nh3 { margin: 22px 0 10px; color: #aabcc8; font-size: 11px; font-weight: 550; }\n.code-inspector { max-height: 260px; padding: 13px; margin: 0; overflow: auto; border: 1px solid #263945; border-radius: 5px; color: #9ebbc6; background: #091119; font: 10px/1.7 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }\n.boundary-note { padding: 13px; margin-top: 20px; border-left: 2px solid #659889; color: #9ab5be; background: #13262a; font-size: 12px; line-height: 1.65; }\n.evidence-label { display: inline-block; padding: 5px 7px; color: #e0c097; background: #2e261c; border: 1px solid #5d4b31; border-radius: 4px; font: 9px ui-monospace, monospace; }\n[data-panel="evidence"] .code-inspector { margin-top: 16px; }\n.frameulator-logs { margin: 0; color: #9cb7bd; font: 11px/1.8 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }\n.inspector-footer { display: flex; align-items: center; gap: 8px; padding: 0 20px; border-top: 1px solid var(--line); color: #728b9b; font-size: 10px; }\n.inspector-footer span { color: #7fa99c; font-size: 17px; }\n.frameulator-statusbar { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 0 26px; border-top: 1px solid var(--line); color: #91a3af; background: #0c131a; font: 9px ui-monospace, monospace; }\n.frameulator-statusbar [data-status] { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }\n.frameulator-statusbar [data-version] { flex: none; margin-left: auto; color: #648191; }\n.status-light { width: 6px; height: 6px; flex: none; border-radius: 50%; background: #677884; }\n.status-light[data-state="ready"] { background: #a5e9d7; }\n.status-light[data-state="running"] { background: #f1be83; box-shadow: 0 0 9px #f1be8344; }\n@media (min-height: 950px) {\n  .surface-card canvas { height: 160px; }\n}\n@media (max-width: 1060px) {\n  .simulation-badge { display: none; }\n  .frameulator-topbar { gap: 10px; padding-inline: 18px; }\n  .frameulator-main { grid-template-columns: minmax(0, 1fr) 300px; }\n  .frameulator-visuals { padding-inline: 18px; }\n  .frameulator-inspector-body > section { padding: 17px; }\n  .frameulator-inspector > header { padding-inline: 17px; }\n  .surface-help { display: none; }\n}\n@media (max-width: 760px) {\n  .frameulator-shell { grid-template-rows: auto minmax(0, 1fr) 34px; }\n  .frameulator-topbar { flex-wrap: wrap; align-content: center; min-height: 119px; gap: 10px; padding: 12px 16px; }\n  .frameulator-brand strong { font-size: 16px; }\n  .frameulator-brand small { font-size: 8px; }\n  .frameulator-mark { width: 31px; height: 31px; }\n  .frameulator-global-actions { display: grid; grid-template-columns: 1fr 0.7fr 0.7fr 1fr; gap: 6px; width: 100%; }\n  .frameulator-global-actions button { min-height: 36px; padding: 0 9px; font-size: 11px; }\n  .frameulator-main { display: block; overflow: auto; }\n  .frameulator-visuals { display: grid; grid-template-rows: 74px minmax(300px, 45vh) auto; overflow: visible; padding: 0 16px 22px; }\n  .frameulator-surfaces { min-height: 180px; }\n  .surface-list { min-height: 135px; }\n  .frameulator-inspector { min-height: 390px; grid-template-rows: 73px 45px auto 42px; border-top: 1px solid var(--line); border-left: 0; }\n  .frameulator-inspector-body { overflow: visible; }\n  .frameulator-inspector-body > section { padding: 20px; }\n  .frameulator-statusbar { padding-inline: 16px; }\n  .frameulator-statusbar [data-version] { display: none; }\n  .frameulator-eye-dock figure { width: 86px; }\n  .frameulator-eye-dock canvas { height: 48px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  button { transition: none; }\n}\n';

// packages/frameulator/src/element/frameulator-element.ts
var HTMLElementBase = globalThis.HTMLElement ?? class {
};
var FrameulatorElement = class extends HTMLElementBase {
  lab;
  initialized = false;
  generation = 0;
  bindings;
  busy = false;
  applicationState = "EMPTY";
  activeTab = "application";
  currentSnapshot;
  lastInspection = 0;
  logEntries = [];
  lastLifecycleLog = "";
  previews = /* @__PURE__ */ new Map();
  get frameulator() {
    return this.lab;
  }
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    const generation = ++this.generation;
    this.mount(generation).catch((error) => {
      if (generation === this.generation) this.showError(error);
    });
  }
  disconnectedCallback() {
    ++this.generation;
    this.bindings?.abort();
    this.lab?.destroy().catch(() => void 0);
    this.lab = void 0;
    this.previews.clear();
    this.initialized = false;
    this.applicationState = "EMPTY";
    this.currentSnapshot = void 0;
    this.lastLifecycleLog = "";
    this.busy = false;
  }
  async mount(generation) {
    this.activeTab = "application";
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.bindings = new AbortController();
    const signal = this.bindings.signal;
    root.innerHTML = `
      <style>${styles_default}</style>
      <section class="frameulator-shell" aria-label="Frameulator application workbench" aria-busy="true">
        <header class="frameulator-topbar">
          <div class="frameulator-brand"><span class="frameulator-mark" aria-hidden="true">F</span><div><strong>Frameulator</strong><small>APPLICATION WORKBENCH</small></div></div>
          <span class="simulation-badge">BROWSER SIMULATION</span>
          <div class="frameulator-global-actions">
            <button type="button" data-action="sample" disabled>Load sample</button>
            <button type="button" class="primary" data-action="start" disabled>Start</button>
            <button type="button" data-action="stop" disabled>Stop</button>
            <button type="button" data-action="export" disabled>Export report</button>
          </div>
        </header>
        <main class="frameulator-main">
          <section class="frameulator-visuals" aria-label="Simulation and adapter surfaces">
            <div class="section-heading"><div><span class="eyebrow">01 / SIMULATION</span><h1>Application space</h1></div><span class="state-chip" data-session-state>IDLE</span></div>
            <div class="frameulator-stage" aria-label="Three-dimensional simulated device">
              <div class="frameulator-viewport-hud"><span>STEAM FRAME PROFILE</span><span data-frame-count>0 FRAMES</span></div>
              <div class="frameulator-empty" data-empty>
                <span class="empty-symbol" aria-hidden="true">\uFF0B</span>
                <h2>A space for your application</h2>
                <p>Load the neutral sample to explore lifecycle, surface output and input.</p>
                <button type="button" class="primary" data-action="sample" disabled>Load sample panel</button>
              </div>
              <div class="frameulator-eye-dock" aria-label="Simulated scene eye previews">
                <figure><canvas width="180" height="132" data-eye="left" aria-label="Simulated scene left eye"></canvas><figcaption>SIMULATED \xB7 LEFT</figcaption></figure>
                <figure><canvas width="180" height="132" data-eye="right" aria-label="Simulated scene right eye"></canvas><figcaption>SIMULATED \xB7 RIGHT</figcaption></figure>
              </div>
            </div>
            <section class="frameulator-surfaces" aria-label="Adapter RGBA surfaces">
              <div class="surface-heading"><div><span class="eyebrow">02 / ADAPTER OUTPUT</span><h2>Surface inspector <span data-surface-count>0</span></h2></div><span class="surface-help">RGBA \xB7 TOP-LEFT ORIGIN</span></div>
              <p class="surface-placeholder" data-surface-placeholder>No surfaces yet. Adapter pixel output will appear here.</p>
              <div class="surface-list" data-surfaces></div>
              <output class="pixel-readout" data-pixel-readout>Point at a surface to inspect pixels. Click to send normalized input.</output>
            </section>
          </section>
          <aside class="frameulator-inspector" aria-label="Application inspector">
            <header><div><span class="eyebrow">INSPECTOR</span><h2 data-application-name>No application</h2></div><span class="state-chip" data-application-state>EMPTY</span></header>
            <div class="frameulator-tabs" role="tablist" aria-label="Inspector views">
              <button type="button" id="tab-application" role="tab" aria-controls="panel-application" aria-selected="true" data-tab="application">App</button>
              <button type="button" id="tab-device" role="tab" aria-controls="panel-device" aria-selected="false" tabindex="-1" data-tab="device">Device</button>
              <button type="button" id="tab-evidence" role="tab" aria-controls="panel-evidence" aria-selected="false" tabindex="-1" data-tab="evidence">Evidence</button>
              <button type="button" id="tab-logs" role="tab" aria-controls="panel-logs" aria-selected="false" tabindex="-1" data-tab="logs">Log</button>
            </div>
            <div class="frameulator-inspector-body">
              <section id="panel-application" role="tabpanel" aria-labelledby="tab-application" data-panel="application">
                <p class="section-note">Registered adapters own application behavior. Frameulator supplies the simulated device, lifecycle and inspection tools.</p>
                <dl><div><dt>Application ID</dt><dd data-app-id>\u2014</dd></div><div><dt>Version</dt><dd data-app-version>\u2014</dd></div><div><dt>Lifecycle</dt><dd data-app-lifecycle>EMPTY</dd></div><div><dt>Surface count</dt><dd data-app-surfaces>0</dd></div></dl>
                <div class="action-grid"><button type="button" data-action="reset" disabled>Reset</button><button type="button" data-action="remove" disabled>Remove</button></div>
                <button type="button" class="sample-action" data-action="advance" disabled>Advance sample color <span aria-hidden="true">\u2197</span></button>
                <h3>Application data</h3><pre class="code-inspector" data-app-data aria-label="Application state JSON">No application loaded</pre>
              </section>
              <section id="panel-device" role="tabpanel" aria-labelledby="tab-device" data-panel="device" hidden>
                <p class="section-note">A browser-side model for repeatable inspection. It does not execute a native package or establish device compatibility.</p>
                <dl><div><dt>Profile</dt><dd>Steam Frame</dd></div><div><dt>Architecture model</dt><dd>${SteamFrameProfile.hardware.architecture}</dd></div><div><dt>Eye resolution model</dt><dd>${SteamFrameProfile.display.eyeWidth} \xD7 ${SteamFrameProfile.display.eyeHeight}</dd></div><div><dt>Refresh model</dt><dd>${SteamFrameProfile.display.defaultRefreshRateHz} Hz</dd></div><div><dt>Runtime model</dt><dd>${SteamFrameProfile.openxr.apiVersion}</dd></div></dl>
                <p class="boundary-note">The main view and eye previews visualize the device model. The surface inspector shows the adapter\u2019s actual RGBA output.</p>
              </section>
              <section id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" data-panel="evidence" hidden>
                <div class="evidence-label">SIMULATION ONLY</div><h3>Inspectable, bounded evidence</h3>
                <p class="section-note">Export a JSON report of the current simulated run. Native execution, operating-system behavior and physical hardware require separate validation.</p>
                <button type="button" data-action="export" disabled>Export current report</button>
                <pre class="code-inspector" data-report aria-label="Exported report preview">No report exported</pre>
              </section>
              <section id="panel-logs" role="tabpanel" aria-labelledby="tab-logs" data-panel="logs" hidden><pre class="frameulator-logs" role="log" aria-live="polite"></pre></section>
            </div>
            <footer class="inspector-footer"><span aria-hidden="true">\u25C7</span> Application-neutral adapter contract</footer>
          </aside>
        </main>
        <footer class="frameulator-statusbar"><span class="status-light" data-status-light></span><span role="status" aria-live="polite" data-status>Initializing workbench\u2026</span><span data-version></span></footer>
      </section>`;
    root.addEventListener("click", this.handleClick, { signal });
    root.addEventListener("keydown", this.handleKeyDown, { signal });
    const stage = root.querySelector(".frameulator-stage");
    let lab;
    try {
      lab = await Frameulator.create({ container: stage, profile: "steam-frame", renderer: "auto", storage: "memory", network: "disabled", worker: false });
    } catch (error) {
      stage.querySelectorAll(":scope > canvas").forEach((canvas) => canvas.remove());
      lab = await Frameulator.create({ profile: "steam-frame", renderer: "none", storage: "memory", network: "disabled", worker: false });
      stage.dataset.renderer = "unavailable";
      this.appendLog(`3D preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
      this.setText(".frameulator-viewport-hud span", "3D PREVIEW UNAVAILABLE \xB7 SURFACE INSPECTION ACTIVE");
    }
    if (generation !== this.generation) {
      await lab.destroy();
      return;
    }
    this.lab = lab;
    const left = root.querySelector('[data-eye="left"]');
    const right = root.querySelector('[data-eye="right"]');
    lab.setEyePreviews(left, right);
    this.forwardEvents(lab, signal);
    await this.refresh();
    this.setText("[data-version]", `v${lab.version} \xB7 SIMULATED`);
    this.setText("[data-status]", "Ready \xB7 load an application adapter to begin");
    this.appendLog("Workbench ready. No application loaded.");
    root.querySelector(".frameulator-shell")?.setAttribute("aria-busy", "false");
    this.syncControls();
    this.dispatch("frameulator-ready", { version: lab.version, simulated: true, applicationState: "EMPTY" });
  }
  forwardEvents(lab, signal) {
    for (const type of ["frameulator-frame", "frameulator-state", "frameulator-application", "frameulator-error", "frameulator-result"]) {
      lab.addEventListener(type, ((event) => {
        if (type === "frameulator-frame") this.renderSnapshot(event.detail);
        if (type === "frameulator-state" && event.detail?.sessionState) this.renderSnapshot(event.detail);
        if (type === "frameulator-application") {
          this.applicationState = event.detail.state;
          const lifecycleLog = `${event.detail.state}${event.detail.detail ? ` \xB7 ${event.detail.detail}` : ""}`;
          if (lifecycleLog !== this.lastLifecycleLog) this.appendLog(lifecycleLog);
          this.lastLifecycleLog = lifecycleLog;
          this.syncControls();
        }
        if (type === "frameulator-error") this.showError(event.detail?.message ?? "Application error", false);
        this.dispatch(type, event.detail);
      }), { signal });
    }
  }
  handleClick = (event) => {
    const target = event.target.closest("button");
    if (!target || target.disabled) return;
    if (target.dataset.tab) {
      this.selectTab(target.dataset.tab);
      return;
    }
    const action = target.dataset.action;
    if (action) void this.perform(action);
  };
  handleKeyDown = (event) => {
    const button = event.target.closest("[data-tab]");
    if (button && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = ["application", "device", "evidence", "logs"];
      const index = tabs.indexOf(this.activeTab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      this.selectTab(tabs[next]);
      this.shadowRoot?.querySelector(`[data-tab="${tabs[next]}"]`)?.focus();
      event.preventDefault();
    }
    if (event.key === "Escape" && this.applicationState === "RUNNING" && !this.busy) void this.perform("stop");
  };
  async perform(action) {
    if (!this.lab || this.busy) return;
    const lab = this.lab;
    const generation = this.generation;
    this.busy = true;
    this.syncControls();
    try {
      switch (action) {
        case "sample":
          await lab.loadApplication({ adapterId: "neutral-panel", manifest: { id: "sample-panel", name: "Sample panel", version: "1.0.0" }, config: {} });
          break;
        case "start":
          await lab.start();
          break;
        case "stop":
          await lab.stop();
          break;
        case "reset":
          await lab.reset();
          break;
        case "remove":
          await lab.removeApplication();
          break;
        case "advance":
          await lab.action("sample.advance");
          break;
        case "export":
          await this.downloadReport();
          break;
        default:
          return;
      }
      if (generation !== this.generation) return;
      await this.refresh();
      this.setText("[data-status]", action === "export" ? "Report exported \xB7 simulation evidence only" : `${this.applicationState} \xB7 ${this.currentSnapshot?.application?.descriptor.name ?? "no application loaded"}`);
      this.appendLog(`Completed: ${action}`);
    } catch (error) {
      if (generation === this.generation) this.showError(error);
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.syncControls();
      }
    }
  }
  async refresh() {
    if (!this.lab) return;
    const lab = this.lab;
    const generation = this.generation;
    const snapshot = await lab.snapshot();
    if (lab === this.lab && generation === this.generation) this.renderSnapshot(snapshot, true);
  }
  renderSnapshot(snapshot, force = false) {
    if (!snapshot || !this.lab) return;
    this.currentSnapshot = snapshot;
    const application = snapshot.application;
    this.applicationState = application?.state ?? "EMPTY";
    if (this.applicationState !== "RUNNING") {
      for (const preview of this.previews.values()) {
        const pointerId = preview.pointerId;
        preview.pointerId = void 0;
        preview.lastInput = void 0;
        if (pointerId !== void 0 && preview.canvas.hasPointerCapture(pointerId)) preview.canvas.releasePointerCapture(pointerId);
      }
    }
    this.setText("[data-session-state]", snapshot.sessionState ?? "IDLE");
    this.setText("[data-frame-count]", `${snapshot.frameCount ?? 0} FRAMES`);
    this.renderSurfaces(application?.surfaces ?? []);
    const empty = this.shadowRoot?.querySelector("[data-empty]");
    if (empty) empty.hidden = Boolean(application);
    this.syncControls();
    const now = performance.now();
    if (!force && now - this.lastInspection < 120) return;
    this.lastInspection = now;
    this.setText("[data-application-name]", application?.descriptor.name ?? "No application");
    this.setText("[data-application-state]", this.applicationState);
    this.setText("[data-app-id]", application?.descriptor.id ?? "\u2014");
    this.setText("[data-app-version]", application?.descriptor.version ?? "\u2014");
    this.setText("[data-app-lifecycle]", this.applicationState);
    this.setText("[data-app-surfaces]", String(application?.surfaces.length ?? 0));
    this.setText("[data-app-data]", application ? JSON.stringify(application.data, null, 2) ?? "null" : "No application loaded");
  }
  renderSurfaces(surfaces) {
    const list = this.shadowRoot?.querySelector("[data-surfaces]");
    if (!list) return;
    const ids = new Set(surfaces.map((surface) => surface.id));
    for (const [id, preview] of this.previews) {
      if (!ids.has(id)) {
        preview.element.remove();
        this.previews.delete(id);
      }
    }
    for (const surface of surfaces) {
      let preview = this.previews.get(surface.id);
      if (!preview) {
        const element = this.ownerDocument.createElement("figure");
        element.className = "surface-card";
        const label = this.ownerDocument.createElement("figcaption");
        const canvas = this.ownerDocument.createElement("canvas");
        canvas.setAttribute("aria-label", `RGBA surface ${surface.id}. Click to send pointer input.`);
        element.append(canvas, label);
        list.append(element);
        preview = { element, canvas, label, surface, revision: -1 };
        this.previews.set(surface.id, preview);
        const boundPreview = preview;
        for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
          canvas.addEventListener(type, (event) => this.handleSurfacePointer(event, boundPreview), { signal: this.bindings.signal });
        }
      }
      const resized = preview.canvas.width !== surface.width || preview.canvas.height !== surface.height;
      preview.surface = surface;
      preview.label.textContent = `${surface.id} \xB7 ${surface.width} \xD7 ${surface.height} \xB7 rev ${surface.revision}${surface.visible === false ? " \xB7 hidden in scene" : ""}`;
      if (resized || preview.revision !== surface.revision) {
        if (resized) {
          preview.canvas.width = surface.width;
          preview.canvas.height = surface.height;
        }
        const context = preview.canvas.getContext("2d");
        if (context) {
          const pixels = context.createImageData(surface.width, surface.height);
          pixels.data.set(surface.rgba);
          context.putImageData(pixels, 0, 0);
        }
        preview.revision = surface.revision;
      }
    }
    this.setText("[data-surface-count]", String(surfaces.length));
    const placeholder = this.shadowRoot?.querySelector("[data-surface-placeholder]");
    if (placeholder) placeholder.hidden = surfaces.length > 0;
    if (surfaces.length === 0) this.setText("[data-pixel-readout]", "Point at a surface to inspect pixels. Click to send normalized input.");
  }
  handleSurfacePointer(event, preview) {
    if (preview.pointerId !== void 0 && event.pointerId !== preview.pointerId) return;
    if (event.type === "lostpointercapture" && preview.pointerId === void 0) return;
    const bounds = preview.canvas.getBoundingClientRect();
    const rawX = (event.clientX - bounds.left) / bounds.width;
    const rawY = (event.clientY - bounds.top) / bounds.height;
    const outside = rawX < 0 || rawX > 1 || rawY < 0 || rawY > 1;
    const x = Math.max(0, Math.min(1, rawX));
    const y = Math.max(0, Math.min(1, rawY));
    const px = Math.min(preview.surface.width - 1, Math.floor(x * preview.surface.width));
    const py = Math.min(preview.surface.height - 1, Math.floor(y * preview.surface.height));
    const offset = (py * preview.surface.width + px) * 4;
    const rgba = Array.from(preview.surface.rgba.subarray(offset, offset + 4));
    this.setText("[data-pixel-readout]", `${preview.surface.id} \xB7 (${px}, ${py}) \xB7 RGBA ${rgba.join(", ")} \xB7 normalized ${x.toFixed(3)}, ${y.toFixed(3)}`);
    const phase = event.type === "pointerdown" ? "down" : event.type === "pointerup" ? outside ? "cancel" : "up" : event.type === "pointermove" ? "move" : "cancel";
    if (!this.lab || this.busy || this.applicationState !== "RUNNING") {
      if (phase === "up" || phase === "cancel") {
        preview.pointerId = void 0;
        preview.lastInput = void 0;
        if (preview.canvas.hasPointerCapture(event.pointerId)) preview.canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const button = phase === "move" ? preview.pointerId !== void 0 ? preview.lastInput?.button ?? 0 : 0 : event.button;
    const input = phase === "cancel" && preview.lastInput ? { ...preview.lastInput, phase } : { type: "pointer", surfaceId: preview.surface.id, phase, x, y, button };
    if (phase === "down") {
      event.preventDefault();
      preview.pointerId = event.pointerId;
      preview.canvas.setPointerCapture(event.pointerId);
    }
    preview.lastInput = input;
    if (phase === "up" || phase === "cancel") {
      preview.pointerId = void 0;
      if (preview.canvas.hasPointerCapture(event.pointerId)) preview.canvas.releasePointerCapture(event.pointerId);
    }
    void this.lab.input(input).then(() => this.refresh()).catch((error) => this.showError(error));
  }
  syncControls() {
    const loaded = Boolean(this.currentSnapshot?.application);
    const running = this.applicationState === "RUNNING";
    const disabled = {
      sample: loaded,
      start: !loaded || running || this.applicationState === "FAILED",
      stop: !running,
      reset: !loaded,
      remove: !loaded,
      advance: !running || this.currentSnapshot?.application?.adapterId !== "neutral-panel",
      export: !loaded
    };
    this.shadowRoot?.querySelectorAll("[data-action]").forEach((button) => {
      button.disabled = !this.lab || this.busy || Boolean(disabled[button.dataset.action]);
    });
    const advance = this.shadowRoot?.querySelector('[data-action="advance"]');
    if (advance) advance.hidden = loaded && this.currentSnapshot?.application?.adapterId !== "neutral-panel";
    const light = this.shadowRoot?.querySelector("[data-status-light]");
    if (light) light.dataset.state = running ? "running" : loaded ? "ready" : "empty";
    this.shadowRoot?.querySelector(".frameulator-shell")?.setAttribute("aria-busy", String(!this.lab || this.busy));
  }
  selectTab(tab) {
    this.activeTab = tab;
    this.shadowRoot?.querySelectorAll("[data-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.tab === tab));
      button.tabIndex = button.dataset.tab === tab ? 0 : -1;
    });
    this.shadowRoot?.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
  }
  async downloadReport() {
    if (!this.lab) return;
    const report = await this.lab.exportReport();
    const json = JSON.stringify(report, null, 2);
    this.setText("[data-report]", json);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = this.ownerDocument.createElement("a");
    anchor.href = url;
    anchor.download = "frameulator-simulation-report.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    this.selectTab("evidence");
  }
  showError(error, forward = true) {
    const message = error instanceof Error ? error.message : String(error);
    this.setText("[data-status]", `Error \xB7 ${message}`);
    this.appendLog(`ERROR \xB7 ${message}`);
    if (forward) this.dispatch("frameulator-error", { message });
  }
  appendLog(message) {
    this.logEntries.push(`${(/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false })}  ${message}`);
    this.logEntries = this.logEntries.slice(-80);
    this.setText(".frameulator-logs", this.logEntries.join("\n"));
  }
  setText(selector, value) {
    const element = this.shadowRoot?.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }
  dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
};
function defineFrameulatorElement(tagName = "frameulator-lab") {
  if (!("customElements" in globalThis)) return;
  if (!customElements.get(tagName)) customElements.define(tagName, FrameulatorElement);
}

// packages/frameulator/src/application/ReleaseRegistry.ts
var MAX_REGISTRY_BYTES = 1024 * 1024;
var MAX_RELEASES = 1024;
var identifier2 = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
var checksum = /^[0-9a-f]{64}$/;
var approvedLists = /* @__PURE__ */ new WeakSet();
var releaseFields = [
  "appId",
  "version",
  "sourceCommit",
  "adapterId",
  "adapterVersion",
  "packageFile",
  "packageSha256",
  "artifactFile",
  "artifactSha256",
  "executionMode",
  "capsuleAbi"
];
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
function exactFields(value, fields, label) {
  if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new Error(`${label} has missing or unsupported fields.`);
  }
}
function isIdentifier(value) {
  return typeof value === "string" && identifier2.test(value);
}
function isVersion(value) {
  return typeof value === "string" && value.length <= 128 && semver.test(value);
}
function isFile(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 && value === value.trim() && !/[\u0000-\u001f\u007f\\]/.test(value);
}
function resolveReleaseUrl(file, base) {
  let url;
  try {
    url = new URL(file, base ?? (typeof document === "undefined" ? void 0 : document.baseURI));
  } catch {
    throw new Error("The release location is not a resolvable HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("The release location must be an HTTP(S) URL without credentials.");
  }
  return url;
}
function validateRelease(value) {
  const release = record(value, "Release descriptor");
  exactFields(release, releaseFields, "Release descriptor");
  if (!isIdentifier(release.appId)) throw new Error("Release registry contains an invalid application ID.");
  if (!isIdentifier(release.adapterId)) throw new Error("Release registry contains an invalid adapter ID.");
  if (!isVersion(release.version) || !isVersion(release.adapterVersion)) {
    throw new Error("Release registry contains an invalid semantic version.");
  }
  if (typeof release.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(release.sourceCommit)) {
    throw new Error("Release registry contains an invalid source commit.");
  }
  if (!isFile(release.packageFile) || !isFile(release.artifactFile)) {
    throw new Error("Release registry contains an invalid package or artifact file.");
  }
  resolveReleaseUrl(release.artifactFile, new URL("https://registry.invalid/"));
  if (typeof release.packageSha256 !== "string" || !checksum.test(release.packageSha256)) {
    throw new Error("Release registry contains an invalid package checksum.");
  }
  if (typeof release.artifactSha256 !== "string" || !checksum.test(release.artifactSha256)) {
    throw new Error("Release registry contains an invalid artifact checksum.");
  }
  if (release.executionMode !== "browser-wasm-capsule") throw new Error("Release registry contains an unsupported execution mode.");
  if (!Number.isSafeInteger(release.capsuleAbi) || release.capsuleAbi <= 0) {
    throw new Error("Release registry contains an invalid capsule ABI.");
  }
}
function decodeBase642(value, expectedBytes, label) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (typeof value !== "string" || value.length !== 4 * Math.ceil(expectedBytes / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} must be canonical base64 for ${expectedBytes} bytes.`);
  }
  const clean = value.replace(/=+$/, "");
  if (value.endsWith("==") && (alphabet.indexOf(clean.at(-1)) & 15) !== 0 || value.endsWith("=") && !value.endsWith("==") && (alphabet.indexOf(clean.at(-1)) & 3) !== 0) {
    throw new Error(`${label} must be canonical base64.`);
  }
  const output = new Uint8Array(Math.floor(clean.length * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let index = 0;
  for (const character of clean) {
    accumulator = accumulator << 6 | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = accumulator >> bits & 255;
    }
  }
  if (output.byteLength !== expectedBytes) throw new Error(`${label} has an invalid length.`);
  return output;
}
function exactBuffer(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
function requireVerifiedReleases(releases) {
  if (!approvedLists.has(releases)) throw new Error("Application gate requires a verified, signed release registry.");
  return releases;
}
async function verifyReleaseRegistry(document2, trustedKeys) {
  let snapshot;
  let keys;
  try {
    snapshot = structuredClone(document2);
    keys = structuredClone(trustedKeys);
  } catch {
    throw new Error("Release registry and trusted keys must contain serializable data.");
  }
  const registry = record(snapshot, "Release registry");
  exactFields(registry, ["schemaVersion", "algorithm", "keyId", "payload", "signature"], "Release registry");
  if (registry.schemaVersion !== 1 || registry.algorithm !== "Ed25519") throw new Error("Unsupported release registry format.");
  if (!isIdentifier(registry.keyId)) throw new Error("Release registry contains an invalid signing key ID.");
  if (!registry.signature) throw new Error("Release registry is unsigned.");
  const signature = decodeBase642(registry.signature, 64, "Release signature");
  const payload = record(registry.payload, "Release payload");
  exactFields(payload, ["releases"], "Release payload");
  if (!Array.isArray(payload.releases) || payload.releases.length === 0 || payload.releases.length > MAX_RELEASES) {
    throw new Error(`Release registry must contain 1 to ${MAX_RELEASES} approved releases.`);
  }
  for (const release of payload.releases) validateRelease(release);
  const releases = payload.releases;
  if (new Set(releases.map((release) => release.packageSha256)).size !== releases.length) {
    throw new Error("Release registry contains duplicate package checksums.");
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (payloadBytes.byteLength > MAX_REGISTRY_BYTES) throw new Error("Release registry payload exceeds the size limit.");
  if (!Array.isArray(keys)) throw new Error("Trusted release keys must be a list.");
  const keyIds = /* @__PURE__ */ new Set();
  for (const candidate of keys) {
    const trusted = record(candidate, "Trusted release key");
    exactFields(trusted, ["id", "algorithm", "publicKeyBase64"], "Trusted release key");
    if (!isIdentifier(trusted.id) || trusted.algorithm !== "Ed25519" || keyIds.has(trusted.id)) {
      throw new Error("Trusted release keys contain an invalid or duplicate key ID or algorithm.");
    }
    keyIds.add(trusted.id);
    decodeBase642(trusted.publicKeyBase64, 32, "Trusted public key");
  }
  const trustedKey = keys.find((candidate) => candidate.id === registry.keyId);
  if (!trustedKey) throw new Error(`Release registry key is not trusted: ${registry.keyId}`);
  const key = await crypto.subtle.importKey(
    "raw",
    exactBuffer(decodeBase642(trustedKey.publicKeyBase64, 32, "Trusted public key")),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, key, exactBuffer(signature), exactBuffer(payloadBytes));
  if (!valid) throw new Error("Release registry signature verification failed.");
  releases.forEach(Object.freeze);
  const approved = Object.freeze(releases);
  approvedLists.add(approved);
  return approved;
}
async function readBoundedResponse(response, maximumBytes, label) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^(0|[1-9]\d*)$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength)) || Number(declaredLength) > maximumBytes)) {
    void response.body?.cancel().catch(() => void 0);
    throw new Error(`${label} exceeds the size limit or has an invalid content length.`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maximumBytes) throw new Error(`${label} exceeds the size limit.`);
      chunks.push(value.slice());
    }
  } catch (error) {
    void reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function loadReleaseRegistry(source, trustedKeys) {
  if (source === void 0) return { releases: Object.freeze([]) };
  if (typeof source !== "string" && !(source instanceof URL)) return { releases: await verifyReleaseRegistry(source, trustedKeys) };
  const url = resolveReleaseUrl(String(source));
  const response = await fetch(url, { credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`Unable to load release registry (${response.status}).`);
  const bytes = await readBoundedResponse(response, MAX_REGISTRY_BYTES, "Release registry");
  let registry;
  try {
    registry = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Release registry is not valid UTF-8 JSON.");
  }
  return { releases: await verifyReleaseRegistry(registry, trustedKeys), baseUrl: url };
}

// packages/frameulator/src/application/ApplicationGate.ts
var ApplicationGate = class {
  currentState = "EMPTY";
  selected;
  releases;
  maximumBytes;
  maximumArtifactBytes;
  registryBaseUrl;
  onState;
  attempt = 0;
  controller;
  constructor(options) {
    this.releases = requireVerifiedReleases(options.releases);
    this.maximumBytes = options.maximumBytes;
    this.maximumArtifactBytes = options.maximumArtifactBytes ?? options.maximumBytes;
    for (const limit of [this.maximumBytes, this.maximumArtifactBytes]) {
      if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Package and artifact size limits must be positive safe integers.");
    }
    this.registryBaseUrl = options.registryBaseUrl ? new URL(options.registryBaseUrl) : void 0;
    this.onState = options.onState;
  }
  get state() {
    return this.currentState;
  }
  get verification() {
    return this.selected ? structuredClone(this.selected) : void 0;
  }
  async verify(input) {
    const attempt = ++this.attempt;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.selected = void 0;
    this.currentState = "EMPTY";
    let name = "";
    let size = 0;
    let packageSha256 = "";
    try {
      if (!(input instanceof Blob)) throw new Error("Select a package Blob.");
      const inputName = input.name;
      name = typeof inputName === "string" ? inputName : "";
      size = input.size;
      if (!Number.isSafeInteger(size) || size <= 0) throw new Error("The selected package is empty or has an invalid size.");
      if (size > this.maximumBytes) throw new Error("The selected package exceeds the size limit.");
      this.setState("HASHING", "Calculating the package SHA-256 locally.", 0);
      const digest = new IncrementalSha256();
      const reader = Blob.prototype.stream.call(input).getReader();
      let processed = 0;
      try {
        for (; ; ) {
          this.assertCurrent(attempt);
          const { done, value } = await reader.read();
          this.assertCurrent(attempt);
          if (done) break;
          processed += value.byteLength;
          if (processed > this.maximumBytes || processed > size) throw new Error("The selected package exceeds the size limit or changed size.");
          digest.update(value);
          this.setState("HASHING", "Calculating the package SHA-256 locally.", processed / size);
        }
      } catch (error) {
        void reader.cancel().catch(() => void 0);
        throw error;
      } finally {
        reader.releaseLock();
      }
      if (processed !== size) throw new Error("The selected package size does not match its bytes.");
      packageSha256 = digest.digestHex();
      const release = this.releases.find((candidate) => candidate.packageSha256 === packageSha256);
      if (!release) throw new Error("This package is not in the trusted release registry.");
      this.setState("LOADING_ARTIFACT", "Loading the matching signed browser artifact.");
      const artifactUrl = resolveReleaseUrl(release.artifactFile, this.registryBaseUrl);
      this.assertCurrent(attempt);
      const response = await fetch(artifactUrl, { signal: controller.signal, credentials: "omit", redirect: "error" });
      this.assertCurrent(attempt);
      if (!response.ok) throw new Error(`Unable to load the matching artifact (${response.status}).`);
      const artifactBytes = await readBoundedResponse(response, this.maximumArtifactBytes, "Browser artifact");
      this.assertCurrent(attempt);
      if (artifactBytes.byteLength === 0) throw new Error("The matching browser artifact is empty.");
      if (sha256Bytes(artifactBytes) !== release.artifactSha256) {
        throw new Error("The browser artifact checksum does not match the signed registry.");
      }
      const verification = {
        accepted: true,
        fileName: name,
        size,
        packageSha256,
        release: structuredClone(release)
      };
      this.selected = verification;
      this.setState("READY", `${release.appId} ${release.version} has verified package and artifact bytes.`, 1);
      this.assertCurrent(attempt);
      return { verification: structuredClone(verification), artifactBytes };
    } catch (error) {
      if (attempt === this.attempt) {
        const message = error instanceof Error ? error.message : "Package verification failed.";
        this.selected = { accepted: false, fileName: name, size, packageSha256, reason: message };
        this.setState("REJECTED", message);
      }
      throw error;
    } finally {
      if (attempt === this.attempt) this.controller = void 0;
    }
  }
  reset() {
    ++this.attempt;
    this.controller?.abort();
    this.controller = void 0;
    this.selected = void 0;
    this.setState("EMPTY", "Select an approved package to verify its browser artifact.");
  }
  assertCurrent(attempt) {
    if (attempt !== this.attempt) throw new Error("Package verification was superseded or reset.");
  }
  setState(state, detail, progress) {
    this.currentState = state;
    this.onState?.(state, detail, progress);
  }
};
export {
  ApplicationGate,
  ApplicationHost,
  DefaultScenarios,
  Frameulator,
  FrameulatorElement,
  FrameulatorKernel,
  IncrementalSha256,
  NeutralPanelAdapter,
  SteamFrameProfile,
  createScenario,
  defineFrameulatorElement,
  loadReleaseRegistry,
  sha256Blob,
  sha256Bytes,
  verifyReleaseRegistry
};
//# sourceMappingURL=frameulator.js.map
