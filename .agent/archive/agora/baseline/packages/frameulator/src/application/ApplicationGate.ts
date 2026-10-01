import { sha256Blob, sha256Bytes } from "./hash";
import type { AgoraRelease, ApplicationState, FlatpakInput, FlatpakVerification } from "../types";

export interface ApplicationGateOptions {
  releases: AgoraRelease[];
  registryBaseUrl?: URL;
  maximumBytes: number;
  onState(state: ApplicationState, detail: string, progress?: number): void;
}

export class ApplicationGate {
  private currentState: ApplicationState = "EMPTY";
  private selected?: FlatpakVerification;

  constructor(private readonly options: ApplicationGateOptions) {}

  get state(): ApplicationState { return this.currentState; }
  get verification(): FlatpakVerification | undefined { return this.selected ? structuredClone(this.selected) : undefined; }

  async verify(input: FlatpakInput): Promise<{ verification: FlatpakVerification; capsuleBytes: Uint8Array }> {
    const name = input.name ?? "";
    if (!name.toLowerCase().endsWith(".flatpak")) return this.reject("Select a .flatpak bundle.", "", name, input.size);
    if (input.size <= 0) return this.reject("The selected Flatpak is empty.", "", name, input.size);
    if (input.size > this.options.maximumBytes) {
      return this.reject(
        `The selected Flatpak exceeds the ${Math.floor(this.options.maximumBytes / 1048576)} MB limit.`,
        "",
        name,
        input.size,
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
        input.size,
      );
    }
    this.currentState = "READY";
    this.selected = { accepted: true, fileName: name, size: input.size, flatpakSha256, release: structuredClone(release) };
    this.options.onState("READY", `${release.appId} ${release.version} is ready for simulated execution.`, 1);
    return { verification: structuredClone(this.selected), capsuleBytes };
  }

  markRunning(): void { this.setState("RUNNING", "Agora browser capsule is running."); }
  markStopped(): void { this.setState("STOPPED", "Agora browser capsule stopped."); }
  markFailed(message: string): void { this.setState("FAILED", message); }

  reset(): void {
    this.selected = undefined;
    this.setState("EMPTY", "Select an approved Agora Flatpak to begin.");
  }

  private resolveCapsuleUrl(file: string): URL {
    try {
      return new URL(file, this.options.registryBaseUrl ?? (typeof document === "undefined" ? undefined : document.baseURI));
    } catch {
      throw new Error("The release registry does not provide a resolvable capsule URL.");
    }
  }

  private reject(message: string, flatpakSha256 = "", fileName = "", size = 0): never {
    this.currentState = "REJECTED";
    this.selected = { accepted: false, fileName, size, flatpakSha256, reason: message };
    this.options.onState("REJECTED", message);
    throw new Error(message);
  }

  private setState(state: ApplicationState, detail: string, progress?: number): void {
    this.currentState = state;
    this.options.onState(state, detail, progress);
  }
}
