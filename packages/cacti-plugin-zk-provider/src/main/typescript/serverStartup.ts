import { ZeroKnowledgeServer } from "./server/zeroKnowledgeServer.js";
import { readFileSync as s_read } from "fs";
try {
  console.log("serverStartup.js is running");
  console.log("Starting");
  const serverConfig = JSON.parse(
    s_read(__dirname + "../../../serverSetupConfig.json", "utf-8"),
  );
  const server = new ZeroKnowledgeServer(serverConfig, undefined, 3000);
  server.serverInit();
} catch (error) {
  throw error;
}
