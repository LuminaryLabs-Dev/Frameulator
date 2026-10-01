import { IncrementalSha256, sha256Bytes } from "./hash";
import { readBoundedResponse, requireVerifiedReleases, resolveReleaseUrl, type ReleaseDescriptor, type VerifiedReleases } from "./ReleaseRegistry";

export type ApplicationGateState = "EMPTY" | "HASHING" | "LOADING_ARTIFACT" | "READY" | "REJECTED";
export type PackageInput = Blob & { name?: string };
export type PackageVerification = {
  accepted: true;
  fileName: string;
  size: number;
  packageSha256: string;
  release: Readonly<ReleaseDescriptor>;
} | {
  accepted: false;
  fileName: string;
  size: number;
  packageSha256: string;
  reason: string;
};

export interface ApplicationGateOptions {
  /** Use the exact list returned by verifyReleaseRegistry or loadReleaseRegistry. */
  releases: VerifiedReleases;
  registryBaseUrl?: URL;
  maximumBytes: number;
  maximumArtifactBytes?: number;
  onState?(state: ApplicationGateState, detail: string, progress?: number): void;
}

/** Verifies signed byte identity only. This gate never instantiates or executes an artifact. */
export class ApplicationGate {
  private currentState: ApplicationGateState = "EMPTY";
  private selected?: PackageVerification;
  private readonly releases: VerifiedReleases;
  private readonly maximumBytes: number;
  private readonly maximumArtifactBytes: number;
  private readonly registryBaseUrl?: URL;
  private readonly onState?: ApplicationGateOptions["onState"];
  private attempt = 0;
  private controller?: AbortController;

  constructor(options: ApplicationGateOptions) {
    this.releases = requireVerifiedReleases(options.releases);
    this.maximumBytes = options.maximumBytes;
    this.maximumArtifactBytes = options.maximumArtifactBytes ?? options.maximumBytes;
    for (const limit of [this.maximumBytes, this.maximumArtifactBytes]) {
      if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Package and artifact size limits must be positive safe integers.");
    }
    this.registryBaseUrl = options.registryBaseUrl ? new URL(options.registryBaseUrl) : undefined;
    this.onState = options.onState;
  }

  get state(): ApplicationGateState { return this.currentState; }
  get verification(): PackageVerification | undefined { return this.selected ? structuredClone(this.selected) : undefined; }

  async verify(input: PackageInput): Promise<{ verification: Extract<PackageVerification, { accepted: true }>; artifactBytes: Uint8Array }> {
    const attempt = ++this.attempt;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.selected = undefined;
    // Clear even the state before touching caller-controlled input properties.
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
      // Call the Blob implementation directly so a subclass cannot replace its stream with different bytes.
      const reader = Blob.prototype.stream.call(input).getReader();
      let processed = 0;
      try {
        for (;;) {
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
        void reader.cancel().catch(() => undefined);
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
      const verification: Extract<PackageVerification, { accepted: true }> = {
        accepted: true, fileName: name, size, packageSha256, release: structuredClone(release),
      };
      this.selected = verification;
      this.setState("READY", `${release.appId} ${release.version} has verified package and artifact bytes.`, 1);
      this.assertCurrent(attempt);
      return { verification: structuredClone(verification), artifactBytes };
    } catch (error) {
      // A superseded request must never overwrite the newer request's state or result.
      if (attempt === this.attempt) {
        const message = error instanceof Error ? error.message : "Package verification failed.";
        this.selected = { accepted: false, fileName: name, size, packageSha256, reason: message };
        this.setState("REJECTED", message);
      }
      throw error;
    } finally {
      if (attempt === this.attempt) this.controller = undefined;
    }
  }

  reset(): void {
    ++this.attempt;
    this.controller?.abort();
    this.controller = undefined;
    this.selected = undefined;
    this.setState("EMPTY", "Select an approved package to verify its browser artifact.");
  }

  private assertCurrent(attempt: number): void {
    if (attempt !== this.attempt) throw new Error("Package verification was superseded or reset.");
  }

  private setState(state: ApplicationGateState, detail: string, progress?: number): void {
    this.currentState = state;
    this.onState?.(state, detail, progress);
  }
}
