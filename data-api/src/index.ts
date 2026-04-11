import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import { AppDataSource } from "./configs/data-source.config";
import app from "./app";
import logger from "./utils/logger";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const main = async () => {
  try {
    await AppDataSource.initialize();
    logger.info("Database connected");
    app.listen(PORT, () => {
      logger.info(`Data API listening on port ${PORT}`);
    });
  } catch (err) {
    logger.error(err, "Database connection failed");
    process.exit(1);
  }
}

main();
