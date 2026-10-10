import { parentPort, workerData } from "node:worker_threads";
import { analyzeLocalExperiment } from "./analysis.ts";

if (!parentPort) throw new Error("WORKER_ONLY");
// Only this project-authored module executes; inspected source is captured as data.
const result = await analyzeLocalExperiment(
  workerData.root,
  workerData.selections,
  workerData.options,
);
parentPort.postMessage(result);
