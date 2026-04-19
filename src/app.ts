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

const corsOptions = { origin: ["http://localhost:5173", "http://127.0.0.1:5173"], credentials: true };
app.use(cors(corsOptions));
app.options("/{*path}", cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: false }));
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
