export interface KernelExports extends WebAssembly.Exports {
  frameulator_reset(): void;
  frameulator_start(): number;
  frameulator_stop(): number;
  frameulator_step(deltaMicros: number): number;
  frameulator_inject_event(event: number): number;
  frameulator_session_state(): number;
  frameulator_frame_count(): bigint;
  frameulator_elapsed_micros(): bigint;
  frameulator_event_count(): number;
  frameulator_abi_version(): number;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    const decoded = atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/=+$/, "");
  const output = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let index = 0;
  for (const character of clean) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) continue;
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = (accumulator >> bits) & 0xff;
    }
  }
  return output;
}

async function bytesFromUrl(url: string | URL): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load Frameulator WASM (${response.status}).`);
  return response.arrayBuffer();
}

export async function instantiateKernel(options: {
  wasmBytes?: ArrayBuffer | Uint8Array;
  wasmBase64?: string;
  wasmUrl?: string | URL;
}): Promise<KernelExports> {
  let source: ArrayBuffer | Uint8Array | undefined = options.wasmBytes;
  if (!source && options.wasmBase64) source = decodeBase64(options.wasmBase64);
  if (!source && options.wasmUrl) source = await bytesFromUrl(options.wasmUrl);
  if (!source) throw new Error("No Frameulator WASM source was provided.");

  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const instantiated = await WebAssembly.instantiate(bytes, {}) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
  const instance = instantiated.instance;
  const exports = instance.exports as KernelExports;
  if (exports.frameulator_abi_version() !== 1) {
    throw new Error("Unsupported Frameulator WASM ABI.");
  }
  return exports;
}
