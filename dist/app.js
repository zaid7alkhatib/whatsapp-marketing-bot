"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const routes_1 = __importDefault(require("./routes"));
const notFound_1 = require("./shared/middlewares/notFound");
const errorHandler_1 = require("./shared/middlewares/errorHandler");
const app = (0, express_1.default)();
const corsOptions = { origin: env_1.env.corsOrigins, credentials: true };
app.use((0, cors_1.default)(corsOptions));
app.options("/{*path}", (0, cors_1.default)(corsOptions));
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: false }));
app.use((0, morgan_1.default)(env_1.env.nodeEnv === "production" ? "combined" : "dev", {
    skip: (req) => req.path === "/health",
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/", routes_1.default);
app.use(notFound_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
exports.default = app;
