import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import http from "http";
import { AppDataSource } from "./configs/data-source.config";
import app from "./app";
import logger from "./utils/logger";
import { attachDockerShellHandler } from "./websocket/dockerShell.ws";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const main = async () => {
  try {
    await AppDataSource.initialize();
    logger.info("Database connected");

    const server = http.createServer(app);
    attachDockerShellHandler(server);

    server.listen(PORT, () => {
      logger.info(`Data API listening on port ${PORT}`);
    });
  } catch (err) {
    logger.error(err, "Database connection failed");
    process.exit(1);
  }
}

main();
