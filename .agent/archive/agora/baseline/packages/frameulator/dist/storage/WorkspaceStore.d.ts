export type StoredWorkbenchSection = "package" | "device" | "deploy" | "session" | "tests" | "evidence";
interface WorkbenchPreferences {
    schemaVersion: 1;
    lastSection: StoredWorkbenchSection;
}
export declare class WorkspaceStore {
    private readonly key;
    constructor(key?: string);
    load(): WorkbenchPreferences | undefined;
    save(lastSection: StoredWorkbenchSection): void;
    clear(): void;
}
export {};
