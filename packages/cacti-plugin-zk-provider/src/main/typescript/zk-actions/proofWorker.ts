import { parentPort, workerData } from "worker_threads";
import { initialize } from "zokrates-js";
(async () => {
  const { program, witness, provingKey } = workerData;
  const provider = await initialize();
  const proof = await provider.generateProof(program, witness, provingKey);
  parentPort?.postMessage(proof);
})();
