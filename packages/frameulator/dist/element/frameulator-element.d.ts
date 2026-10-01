import { Frameulator } from "../Frameulator";
declare const HTMLElementBase: typeof HTMLElement;
/** A neutral example UI. Embedders can use `frameulator` after ready to load an adapter. */
export declare class FrameulatorElement extends HTMLElementBase {
    private lab?;
    private initialized;
    private generation;
    private bindings?;
    private busy;
    private applicationState;
    private activeTab;
    private currentSnapshot?;
    private lastInspection;
    private logEntries;
    private lastLifecycleLog;
    private previews;
    get frameulator(): Frameulator | undefined;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private mount;
    private forwardEvents;
    private handleClick;
    private handleKeyDown;
    private perform;
    private refresh;
    private renderSnapshot;
    private renderSurfaces;
    private handleSurfacePointer;
    private syncControls;
    private selectTab;
    private downloadReport;
    private showError;
    private appendLog;
    private setText;
    private dispatch;
}
export declare function defineFrameulatorElement(tagName?: string): void;
export {};
