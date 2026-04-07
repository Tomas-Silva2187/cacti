import { parentPort, workerData } from "worker_threads";
import { initialize } from "zokrates-js";
(async () => {
  const { compilation, inputs, provingKey, sessionId } = workerData;
  console.log(`Worker generating proof for session ${sessionId}`);
  const provider = await initialize();
  console.log(sessionId, " Witness start at ", Date.now());
  const witness = await provider.computeWitness(compilation, inputs);
  console.log(sessionId, " Witness end at ", Date.now());
  console.log(sessionId, " Proof start at ", Date.now());
  const proof = await provider.generateProof(
    compilation.program,
    witness.witness,
    provingKey,
  );
  console.log(sessionId, " Proof end at ", Date.now());
  parentPort?.postMessage({ proof: proof });
})();
