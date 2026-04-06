import { parentPort, workerData } from "worker_threads";

(async () => {
  const { sessionId } = workerData;
  let i = 0;
  while (i < 20000) {
    i += 1;
    console.log(sessionId);
  }
  parentPort?.postMessage(sessionId);
})();
