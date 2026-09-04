import type { ScenarioReport } from "../types";
export interface ReportStore {
    save(report: ScenarioReport): Promise<void>;
    latest(): Promise<ScenarioReport | undefined>;
    close(): void;
}
export declare class MemoryReportStore implements ReportStore {
    private report?;
    save(report: ScenarioReport): Promise<void>;
    latest(): Promise<ScenarioReport | undefined>;
    close(): void;
}
export declare class IndexedDbReportStore implements ReportStore {
    private readonly database;
    private constructor();
    static create(): Promise<IndexedDbReportStore>;
    save(report: ScenarioReport): Promise<void>;
    latest(): Promise<ScenarioReport | undefined>;
    close(): void;
    private transaction;
}
