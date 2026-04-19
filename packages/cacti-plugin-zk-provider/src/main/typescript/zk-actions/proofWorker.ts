import { parentPort, workerData } from "worker_threads";
import { initialize } from "zokrates-js";
import { cpus } from "os";

const NUM_CORES = cpus().length;

function sampleResources(): {
  mem: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  ts: number;
} {
  return {
    mem: process.memoryUsage(),
    cpu: process.cpuUsage(),
    ts: Date.now(),
  };
}

/*function trackPeakMemory(intervalMs = 50): {
  stop: () => { peakRssMB: number; peakHeapMB: number };
} {
  let peakRss = 0;
  let peakHeap = 0;
  const id = setInterval(() => {
    const m = process.memoryUsage();
    if (m.rss > peakRss) peakRss = m.rss;
    if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
  }, intervalMs);
  return {
    stop: () => {
      clearInterval(id);
      return {
        peakRssMB: peakRss / 1024 / 1024,
        peakHeapMB: peakHeap / 1024 / 1024,
      };
    },
  };
}*/

function logResourceDelta(
  label: string,
  sessionId: string,
  before: ReturnType<typeof sampleResources>,
  after: ReturnType<typeof sampleResources>,
  //peak?: { peakRssMB: number; peakHeapMB: number },
): any {
  const wallMs = after.ts - before.ts;
  const cpuUserMs = (after.cpu.user - before.cpu.user) / 1000;
  const cpuSysMs = (after.cpu.system - before.cpu.system) / 1000;
  const cpuUtilPct =
    wallMs > 0 ? ((cpuUserMs + cpuSysMs) / wallMs / NUM_CORES) * 100 : 0;
  /*const heapDeltaMB = (after.mem.heapUsed - before.mem.heapUsed) / 1024 / 1024;
  const rssDeltaMB = (after.mem.rss - before.mem.rss) / 1024 / 1024;
  const peakStr = peak
    ? ` | peak RSS: ${peak.peakRssMB.toFixed(2)} MB peak heap: ${peak.peakHeapMB.toFixed(2)} MB (process-wide)`
    : "";
  console.log(
    `[${sessionId}] ${label} | wall: ${wallMs}ms | CPU user: ${cpuUserMs.toFixed(1)}ms sys: ${cpuSysMs.toFixed(1)}ms util: ${cpuUtilPct.toFixed(1)}% (across ${NUM_CORES} cores) | heap Δ: ${heapDeltaMB.toFixed(2)} MB | rss Δ: ${rssDeltaMB.toFixed(2)} MB${peakStr}`,
  );*/
  return { elapsedTime: wallMs, cpu: cpuUtilPct.toFixed(1) };
}
(async () => {
  const { compilation, inputs, provingKey, sessionId } = workerData;

  const provider = await initialize();

  //const witnessMemTracker = trackPeakMemory();
  const beforeWitness = sampleResources();
  const witness = await provider.computeWitness(compilation, inputs);
  const afterWitness = sampleResources();
  //const witnessPeak = witnessMemTracker.stop();
  const witnessStats = logResourceDelta(
    "computeWitness",
    sessionId,
    beforeWitness,
    afterWitness,
  );

  //const proofMemTracker = trackPeakMemory();
  const beforeProof = sampleResources();
  const proof = await provider.generateProof(
    compilation.program,
    witness.witness,
    provingKey,
  );
  const afterProof = sampleResources();
  //const proofPeak = proofMemTracker.stop();
  const proofStats = logResourceDelta(
    "generateProof ",
    sessionId,
    beforeProof,
    afterProof,
    //proofPeak,
  );

  console.log("Witness ", sessionId, " elapsedTime ", witnessStats.elapsedTime);
  console.log("Proof ", sessionId, " elapsedTime", proofStats.elapsedTime);

  parentPort?.postMessage({
    proof: proof,
  });
})();
