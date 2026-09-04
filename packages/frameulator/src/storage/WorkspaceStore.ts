export type StoredWorkbenchSection = "package" | "device" | "deploy" | "session" | "tests" | "evidence";

interface WorkbenchPreferences {
  schemaVersion: 1;
  lastSection: StoredWorkbenchSection;
}

export class WorkspaceStore {
  constructor(private readonly key = "frameulator-workbench-v1") {}

  load(): WorkbenchPreferences | undefined {
    try {
      const value = globalThis.localStorage?.getItem(this.key);
      if (!value) return undefined;
      const parsed = JSON.parse(value) as Partial<WorkbenchPreferences>;
      const allowed = new Set<StoredWorkbenchSection>(["package", "device", "deploy", "session", "tests", "evidence"]);
      if (parsed.schemaVersion !== 1 || !parsed.lastSection || !allowed.has(parsed.lastSection)) return undefined;
      return { schemaVersion: 1, lastSection: parsed.lastSection };
    } catch {
      return undefined;
    }
  }

  save(lastSection: StoredWorkbenchSection): void {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify({ schemaVersion: 1, lastSection }));
    } catch {
      // Workbench preferences are optional; application execution remains available.
    }
  }

  clear(): void {
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
      // Local storage may be unavailable in privacy modes.
    }
  }
}
