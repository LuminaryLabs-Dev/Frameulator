import type { Scenario, ScenarioStep } from "./types";
export declare const DefaultScenarios: readonly Scenario[];
export declare function createScenario(id: string, steps: ScenarioStep[], label?: string): Scenario;
export declare function resolveScenario(scenario: Scenario | string): Scenario;
