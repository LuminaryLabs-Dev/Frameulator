import type { NativeEvidence, ScenarioReport } from "../types";
export interface ReportStore {
    save(report: ScenarioReport): Promise<void>;
    latest(): Promise<ScenarioReport | undefined>;
    clear(): Promise<void>;
    saveNative(evidence: NativeEvidence): Promise<void>;
    latestNative(): Promise<NativeEvidence | undefined>;
    close(): void;
}
export declare class MemoryReportStore implements ReportStore {
    private report?;
    private native?;
    save(report: ScenarioReport): Promise<void>;
    latest(): Promise<ScenarioReport | undefined>;
    clear(): Promise<void>;
    saveNative(evidence: NativeEvidence): Promise<void>;
    latestNative(): Promise<NativeEvidence | undefined>;
    close(): void;
}
export declare class IndexedDbReportStore implements ReportStore {
    private readonly database;
    private constructor();
    static create(): Promise<IndexedDbReportStore>;
    save(report: ScenarioReport): Promise<void>;
    latest(): Promise<ScenarioReport | undefined>;
    clear(): Promise<void>;
    saveNative(evidence: NativeEvidence): Promise<void>;
    latestNative(): Promise<NativeEvidence | undefined>;
    close(): void;
    private transaction;
}
