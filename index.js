import Express from "express";
import { config } from "dotenv";
import router from "./router.js";
import mongoose from "mongoose";
import winston from "winston";
import cron from "node-cron";

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
      ),
    }),
  ],
});

config();
const MONGODB_STRING = process.env.MONGODB_STRING;
const PORT = process.env.PORT;

const app = Express();
app.use(Express.json());

router.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the MockMaster" });
});

app.use("/api", router);

cron.schedule("*/20 * * * *", () => {
  fetch("https://mettl-hack.onrender.com/api")
    .then(() => {
      logger.info("Server kept awake successfully");
    })
    .catch(error => {
      logger.error("Error keeping server awake:", error.message);
    });
});

app.listen(PORT || 3000, () => {
  logger.info(`Server is running on port ${PORT}`);
  mongoose.connect(MONGODB_STRING);

  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "connection error:"));
  db.once("open", () => {
    logger.info("Connected to MongoDB");
  });
});
