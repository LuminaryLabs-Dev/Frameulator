export declare class IncrementalSha256 {
    private readonly state;
    private readonly buffer;
    private readonly words;
    private bufferLength;
    private bytesHashed;
    private finished;
    update(input: Uint8Array): this;
    digestHex(): string;
    digest(): Uint8Array;
    private compress;
}
export declare function sha256Blob(blob: Blob, progress?: (processed: number, total: number) => void): Promise<string>;
export declare function sha256Bytes(bytes: Uint8Array): string;
