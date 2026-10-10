import type { LocalSelection } from "./ingestion.ts";

const directory = "examples/fixtures/mercurypay";
export const FIXTURE_SELECTIONS: readonly LocalSelection[] = Object.freeze([
  { path: `${directory}/contracts/v1.openapi.json`, role: "base-contract" },
  { path: `${directory}/contracts/v2.openapi.json`, role: "candidate-contract" },
  { path: `${directory}/migration-ground-truth/mapping.json`, role: "mapping" },
  { path: "apps/demo-shop/src/v1-adapter.ts", role: "source" },
]);
