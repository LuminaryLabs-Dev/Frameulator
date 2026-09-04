declare const HTMLElementBase: typeof HTMLElement;
export declare class FrameulatorElement extends HTMLElementBase {
    private lab?;
    private initialized;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private mount;
    private forwardEvents;
    private bindControls;
    private renderServices;
    private setState;
    private showReport;
    private showError;
    private downloadReport;
    private dispatch;
}
export declare function defineFrameulatorElement(tagName?: string): void;
export {};
