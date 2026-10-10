import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const simulation = vi.hoisted(() => ({ event: "error" as "error" | "exit" | "message" | "start" }));
vi.mock("node:worker_threads", () => ({
  Worker: class extends EventEmitter {
    constructor() {
      super();
      if (simulation.event === "start") throw new Error("missing engine");
      queueMicrotask(() =>
        this.emit(
          simulation.event,
          simulation.event === "error"
            ? new Error("engine crash")
            : simulation.event === "exit"
              ? 1
              : { invalid: true },
        ),
      );
    }
    terminate() {
      return Promise.resolve(1);
    }
  },
}));
import { runSupervised } from "./supervisor.ts";
import { FIXTURE_SELECTIONS } from "./fixture.ts";

describe("T18 trusted worker fault containment (no external binary adapter)", () => {
  it.each(["start", "error", "exit", "message"] as const)(
    "%s cannot become valid breaking findings",
    async (event) => {
      simulation.event = event;
      const result = await runSupervised(process.cwd(), FIXTURE_SELECTIONS);
      expect(result.state).toBe("INDETERMINATE");
      expect(result.deltas).toEqual([]);
      expect(result.links).toEqual([]);
    },
  );
});
