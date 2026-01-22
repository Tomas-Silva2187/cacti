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
    const redisProcess = spawn("redis-server", ["--port", "6379"], {
      stdio: "inherit",
    });
    redisProcess.on("error", (error: Error) => {
      throw error;
    });

    const redisClient = await createClient({
      url: `redis://localhost:6379`,
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
    const serverConfig = JSON.parse(
      s_read(__dirname + "/../../configs/serverSetupConfig.json", "utf-8"),
    );
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
