import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { analyzeLocalExperiment } from "../../packages/analysis/src/analysis.ts";
import { FIXTURE_SELECTIONS } from "../../packages/analysis/src/fixture.ts";

it("actual MercuryPay analysis matches the reviewed version 2 machine-readable expectation", async () => {
  const expected = JSON.parse(
    await readFile(new URL("./mercurypay.analysis.json", import.meta.url), "utf8"),
  );
  expect(await analyzeLocalExperiment(process.cwd(), FIXTURE_SELECTIONS)).toEqual(expected);
});
