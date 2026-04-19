import { parentPort, workerData } from "worker_threads";
import { initialize } from "zokrates-js";
import fs from "fs";
import path from "path";
(async () => {
  const { circuitPath } = workerData;
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

  const comptime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  console.log("compilation start:", comptime);
  //console.log("Compilation start at ", Date.now());
  const compilationStart = Date.now();
  const compilation = provider.compile(source, options);
  //console.log("Compilation end at ", Date.now());
  //console.log("Keypair gen start at ", Date.now());
  const compilationEnd = Date.now();
  const keytime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  console.log("keytime start: ", keytime);
  const keyPairStart = Date.now();
  const keyPair = provider.setup(compilation.program);
  const keyPairEnd = Date.now();
  console.log(
    "Compilation took ",
    compilationEnd / 1000 - compilationStart / 1000,
  );
  console.log("Keypair took ", keyPairEnd / 1000 - keyPairStart / 1000);
  parentPort?.postMessage({ compilation: compilation, keypair: keyPair });
})();
