import type { NativeEvidence, ScenarioReport } from "../types";

export interface ReportStore {
  save(report: ScenarioReport): Promise<void>;
  latest(): Promise<ScenarioReport | undefined>;
  clear(): Promise<void>;
  saveNative(evidence: NativeEvidence): Promise<void>;
  latestNative(): Promise<NativeEvidence | undefined>;
  close(): void;
}

export class MemoryReportStore implements ReportStore {
  private report?: ScenarioReport;
  private native?: NativeEvidence;

  async save(report: ScenarioReport): Promise<void> {
    this.report = structuredClone(report);
  }

  async latest(): Promise<ScenarioReport | undefined> {
    return this.report ? structuredClone(this.report) : undefined;
  }

  async clear(): Promise<void> {
    this.report = undefined;
    this.native = undefined;
  }

  async saveNative(evidence: NativeEvidence): Promise<void> {
    this.native = structuredClone(evidence);
  }

  async latestNative(): Promise<NativeEvidence | undefined> {
    return this.native ? structuredClone(this.native) : undefined;
  }

  close(): void {}
}

export class IndexedDbReportStore implements ReportStore {
  private constructor(private readonly database: IDBDatabase) {}

  static async create(): Promise<IndexedDbReportStore> {
    if (!("indexedDB" in globalThis)) throw new Error("IndexedDB is not available in this environment.");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("frameulator", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("reports")) {
          request.result.createObjectStore("reports");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open Frameulator storage."));
    });
    return new IndexedDbReportStore(database);
  }

  async save(report: ScenarioReport): Promise<void> {
    await this.transaction("readwrite", (store) => store.put(structuredClone(report), "latest"));
  }

  async latest(): Promise<ScenarioReport | undefined> {
    return this.transaction("readonly", (store) => store.get("latest"));
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.transaction("readwrite", (store) => store.delete("latest")),
      this.transaction("readwrite", (store) => store.delete("latest-native")),
    ]);
  }

  async saveNative(evidence: NativeEvidence): Promise<void> {
    await this.transaction("readwrite", (store) => store.put(structuredClone(evidence), "latest-native"));
  }

  async latestNative(): Promise<NativeEvidence | undefined> {
    return this.transaction("readonly", (store) => store.get("latest-native"));
  }

  close(): void {
    this.database.close();
  }

  private transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("reports", mode);
      const request = action(transaction.objectStore("reports"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Frameulator storage request failed."));
    });
  }
}
