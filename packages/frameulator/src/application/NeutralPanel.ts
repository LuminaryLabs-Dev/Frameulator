import type { ApplicationAdapterFactory } from "./contracts";
import { ensure } from "./contracts";
/** Small independent sample; real products belong to injected adapters. */
export const NeutralPanelAdapter: ApplicationAdapterFactory = {
  id: "neutral-panel",
  version: "1.0.0",
  source: { kind: "builtin", version: "0.3.0" },
  create() {
    let count = 0,
      running = false,
      closed = false,
      down = false;
    const live = () => ensure(!closed, "Sample disposed");
    return {
      start() {
        live();
        running = true;
      },
      stop() {
        live();
        running = false;
        down = false;
      },
      reset() {
        live();
        count = 0;
        running = false;
        down = false;
      },
      step() {
        live();
      },
      input(e) {
        live();
        ensure(running, "Sample not running");
        if (e.phase === "down") down = true;
        if (e.phase === "up") {
          if (down) count++;
          down = false;
        }
        if (e.phase === "cancel") down = false;
      },
      action(name) {
        live();
        ensure(running, "Sample not running");
        ensure(name === "sample.advance", "Unknown sample action");
        count++;
      },
      snapshot() {
        live();
        const width = 256,
          height = 160,
          rgba = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4,
              inside = x > 16 && x < 240 && y > 24 && y < 136;
            rgba.set(
              inside
                ? [
                    40 + ((count * 37) % 160),
                    100 + ((count * 17) % 120),
                    170,
                    255,
                  ]
                : [12, 20, 30, 255],
              i,
            );
          }
        return {
          data: { count, running },
          surfaces: [
            {
              id: "surface.main",
              width,
              height,
              rgba,
              revision: count,
              visible: true,
            },
          ],
        };
      },
      dispose() {
        closed = true;
        running = false;
        down = false;
      },
    };
  },
};
