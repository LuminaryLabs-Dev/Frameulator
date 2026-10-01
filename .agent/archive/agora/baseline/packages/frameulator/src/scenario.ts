import type { Scenario, ScenarioStep } from "./types";

export const DefaultScenarios: readonly Scenario[] = Object.freeze([
  {
    id: "normal-session",
    label: "Normal OpenXR session",
    steps: [
      { action: "start" },
      { action: "step", milliseconds: 13.888 },
      { action: "step", milliseconds: 13.888 },
      { action: "step", milliseconds: 13.888 },
      { action: "assert-state", state: "FOCUSED" },
    ],
  },
  {
    id: "tracking-recovery",
    label: "Tracking loss and recovery",
    steps: [
      { action: "start" },
      { action: "step", milliseconds: 13.888 },
      { action: "event", event: "tracking-lost" },
      { action: "assert-state", state: "LOSS_PENDING" },
      { action: "event", event: "tracking-restored" },
      { action: "assert-state", state: "FOCUSED" },
    ],
  },
]);

export function createScenario(id: string, steps: ScenarioStep[], label = id): Scenario {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Scenario ids must use lowercase kebab-case.");
  }
  if (steps.length === 0) throw new Error("A scenario requires at least one step.");
  return { id, label, steps: structuredClone(steps) };
}

export function resolveScenario(scenario: Scenario | string): Scenario {
  if (typeof scenario !== "string") return scenario;
  const found = DefaultScenarios.find((candidate) => candidate.id === scenario);
  if (!found) throw new Error(`Unknown Frameulator scenario: ${scenario}`);
  return structuredClone(found);
}

