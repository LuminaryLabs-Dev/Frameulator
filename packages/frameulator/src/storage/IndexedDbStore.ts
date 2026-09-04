import type { ScenarioReport } from "../types";

export interface ReportStore {
  save(report: ScenarioReport): Promise<void>;
  latest(): Promise<ScenarioReport | undefined>;
  close(): void;
}

export class MemoryReportStore implements ReportStore {
  private report?: ScenarioReport;

  async save(report: ScenarioReport): Promise<void> {
    this.report = structuredClone(report);
  }

  async latest(): Promise<ScenarioReport | undefined> {
    return this.report ? structuredClone(this.report) : undefined;
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

