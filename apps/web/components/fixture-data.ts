import manifest from "@driftreplay/fixtures/manifest";
import v1 from "@driftreplay/fixtures/v1";
import v2 from "@driftreplay/fixtures/v2";
import businessCase from "@driftreplay/fixtures/business-case";
import assertions from "@driftreplay/fixtures/assertions";
import mapping from "@driftreplay/fixtures/mapping";

export { manifest, v1, v2, businessCase, assertions, mapping };

export const sourceFiles = [
  { label: "Baseline contract", exportName: "v1", data: v1 },
  { label: "Changed contract", exportName: "v2", data: v2 },
  { label: "Business case", exportName: "business-case", data: businessCase },
  { label: "Fixed assertions", exportName: "assertions", data: assertions },
  { label: "Curated migration mapping", exportName: "mapping", data: mapping },
  { label: "Fixture manifest", exportName: "manifest", data: manifest },
] as const;
