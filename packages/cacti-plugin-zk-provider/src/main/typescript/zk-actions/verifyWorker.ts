import { parentPort, workerData } from "worker_threads";
import { initialize } from "zokrates-js";
(async () => {
  const { proof, verificationKey } = workerData;
  console.log(`Worker verifying proof`);
  console.log(proof);
  const provider = await initialize();
  const validity = await provider.verify(verificationKey, proof);
  parentPort?.postMessage({ validity: validity });
})();
