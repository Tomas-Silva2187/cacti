import { readFileSync as s_read } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { spawn } from "child_process";
import { createClient } from "redis";
import { ServerWithDB } from "./main/typescript/server/ServerWithDB.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    const arg = process.argv.slice(2)[0];
    let serverConfig;
    switch (arg) {
      case "ETH_PCU":
        serverConfig = JSON.parse(
          s_read(__dirname + "/../../configs/EthPCU.json", "utf-8"),
        );
        break;
      case "ETH_CRED":
        serverConfig = JSON.parse(
          s_read(__dirname + "/../../configs/EthCredentials.json", "utf-8"),
        );
        break;
      case "BESU_PCU":
        serverConfig = JSON.parse(
          s_read(__dirname + "/../../configs/BesuPCU.json", "utf-8"),
        );
        break;
      case "BESU_CRED":
        serverConfig = JSON.parse(
          s_read(__dirname + "/../../configs/BesuCredentials.json", "utf-8"),
        );
        break;
      case "EXT":
        serverConfig = JSON.parse(
          s_read(__dirname + "/../../configs/ES.json", "utf-8"),
        );
        break;
      default:
        throw new Error(
          "No selection for server type: ETH_PCU, ETH_CRED, BESU_PCU, BESU_CRED, EXT",
        );
    }

    console.log("Creating server with config: ", serverConfig);
    const redisPort = serverConfig.databaseSetup.port;
    const redisProcess = await spawn(
      "redis-server",
      ["--port", redisPort.toString()],
      {
        stdio: "inherit",
      },
    );
    redisProcess.on("error", (error: Error) => {
      throw error;
    });

    const redisClient = await createClient({
      url: `redis://localhost:${redisPort}`,
    });
    await redisClient.connect();
    let server;

    if (serverConfig.serverType === "PCU") {
      server = new ServerWithDB({
        logLevel: serverConfig.logLevel,
        serverType: serverConfig.serverType,
        serverPort: serverConfig.serverPort,
        databaseSetup: {
          type: serverConfig.databaseSetup.type,
          port: serverConfig.databaseSetup.port,
          ipAddress: serverConfig.databaseSetup.ipAddress,
          name: serverConfig.databaseSetup.name,
        },
        serverId: serverConfig.serverId,
        zkHandlerOptions: {
          logLevel: serverConfig.zkHandlerOptions.logLevel,
          zkcircuitPath: serverConfig.zkHandlerOptions.zkcircuitPath,
        },
        counterServers: serverConfig.counterServers,
      });
      await server.serverInit();
    } else {
      server = new ServerWithDB({
        logLevel: serverConfig.logLevel,
        serverType: serverConfig.serverType,
        serverPort: serverConfig.serverPort,
        databaseSetup: {
          type: serverConfig.databaseSetup.type,
          port: serverConfig.databaseSetup.port,
          ipAddress: serverConfig.databaseSetup.ipAddress,
          name: serverConfig.databaseSetup.name,
        },
        serverId: serverConfig.serverId,
      });
      await server.serverInit();
    }
  } catch (error) {
    throw error;
  }
}

main().catch((error) => {
  console.error("Error in server startup:", error);
  process.exit(1);
});
