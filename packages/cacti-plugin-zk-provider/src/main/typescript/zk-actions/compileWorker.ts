import { fileURLToPath } from "url";
import { parentPort, workerData } from "worker_threads";
import { initialize } from "zokrates-js";
import fs from "fs";
import path, { dirname } from "path";
(async () => {
  const { circuitPath } = workerData;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  console.log("LAUNCHING WORKER ON ", __dirname);
  console.log(circuitPath);
  const source = fs.readFileSync(circuitPath).toString();
  const options = {
    location: circuitPath, // location of the root module
    resolveCallback: (currentLocation, importLocation) => {
      const dir = path.dirname(currentLocation);
      const importPath = path.resolve(dir, importLocation);
      if (!fs.existsSync(importPath)) {
        console.log(`[resolveCallback] File not found: ${importPath}`);
        throw new Error(`ZoKrates import error: File not found: ${importPath}`);
      }
      const importSource = fs.readFileSync(importPath, "utf8");
      return {
        source: importSource,
        location: importPath,
      };
    },
  };
  const provider = await initialize();
  const compilation = provider.compile(source, options);
  const keyPair = provider.setup(compilation.program);
  parentPort?.postMessage({ compilation: compilation, keypair: keyPair });
})();
