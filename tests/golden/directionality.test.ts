import { expect, it } from "vitest";
import cases from "./directionality.json";
import { compareContracts } from "../../packages/analysis/src/openapi.ts";

export function contract(direction: string, schema: unknown) {
  return {
    openapi: "3.0.3",
    info: { title: "Controlled directionality expectation", version: "1" },
    paths: {
      "/charge": {
        post: {
          ...(direction === "request"
            ? { requestBody: { required: true, content: { "application/json": { schema } } } }
            : {}),
          responses: {
            "200": {
              description: "Synthetic",
              ...(direction === "response" ? { content: { "application/json": { schema } } } : {}),
            },
          },
        },
      },
    },
  };
}
it.each(cases)("directional golden: $name", (item) => {
  const result = compareContracts(
    contract(item.direction, item.before),
    contract(item.direction, item.after),
  );
  expect(result.deltas).toEqual(item.expected);
  expect(result.deltas).toHaveLength(1);
  expect(result.deltas[0]!.compatibility).toBe(item.compatibility);
});
