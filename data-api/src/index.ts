import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import { AppDataSource } from "./data-source";
import app from "./app";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

(async () => {
  try {
    await AppDataSource.initialize();
    console.log("Database connected");
    app.listen(PORT, () => {
      console.log(`Data API listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }
})();


