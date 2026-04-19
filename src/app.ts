import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import type { Request } from "express";
import { env } from "./config/env";
import routes from "./routes";
import { notFoundHandler } from "./shared/middlewares/notFound";
import { errorHandler } from "./shared/middlewares/errorHandler";

const app = express();

app.use(helmet());
app.use(cors());
app.use(
  morgan(env.nodeEnv === "production" ? "combined" : "dev", {
    skip: (req: Request) => req.path === "/health",
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
