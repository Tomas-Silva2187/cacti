import { parentPort, workerData } from "worker_threads";
import { initialize } from "zokrates-js";
(async () => {
  const { compilation, inputs } = workerData;
  const provider = await initialize();
  const proof = await provider.computeWitness(compilation, inputs);
  parentPort?.postMessage(proof);
})();
