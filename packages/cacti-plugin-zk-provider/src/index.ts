import { ZeroKnowledgeServer } from "./main/typescript/server/zeroKnowledgeServer.js";
import { readFileSync as s_read } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { spawn } from "child_process";
import { createClient } from "redis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    const arg = process.argv.slice(2)[0];
    let serverConfig;
    let redisProcess;
    let redisPort;
    if (arg !== undefined && arg == "0") {
      serverConfig = JSON.parse(
        s_read(__dirname + "/../../configs/localServerSetupConfig.json", "utf-8"),
      );
      console.log("Creating local server with config: ", serverConfig);
      redisPort = serverConfig.databaseSetup.port;
      redisProcess = await spawn("redis-server", ["--port", redisPort.toString()], {
      stdio: "inherit",
    });
    redisProcess.on("error", (error: Error) => {
      throw error;
    });
    }
    else if (arg !== undefined && arg == "1") {
      serverConfig = JSON.parse(
        s_read(__dirname + "/../../configs/serverSetupConfig.json", "utf-8"),
      );
      console.log("Creating offload server with config: ", serverConfig);
      redisPort = serverConfig.databaseSetup.port;
      redisProcess = await spawn("redis-server", ["--port", redisPort.toString(), "--bind", "0.0.0.0", "--protected-mode", "no"], {
      stdio: "inherit",
    });
    redisProcess.on("error", (error: Error) => {
      throw error;
    });
    }
    else {
      throw new Error("No selection for server type: 0- local, 1- offload")
    }

    const redisClient = await createClient({
      url: `redis://localhost:${redisPort}`,
    });
    await redisClient.connect();
    let retries = 10;
    for (retries; retries > 0; retries--) {
      try {
        const pong = await redisClient.ping();
        if (pong === "PONG") break;
      } catch (e) {
        continue;
      }
      console.log(`Retry ${retries} to connect to Redis...`);
    }

    console.log("Starting Server");
    const server = new ZeroKnowledgeServer(serverConfig, undefined);
    await server.serverInit();
  } catch (error) {
    throw error;
  }
}

main().catch((error) => {
  console.error("Error in server startup:", error);
  process.exit(1);
});
