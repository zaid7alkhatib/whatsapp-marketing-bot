"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const bootstrap_1 = require("./database/bootstrap");
const connect_1 = require("./database/connect");
const baileys_service_1 = require("./integrations/baileys/baileys.service");
async function startServer() {
    try {
        await (0, connect_1.connectDatabase)();
        await (0, bootstrap_1.bootstrapSuperAdmin)();
        await (0, bootstrap_1.bootstrapWhatsAppWorkspace)();
        await (0, baileys_service_1.restoreConnectedBaileysAccounts)();
        app_1.default.listen(env_1.env.port, () => {
            console.log(`Server running on http://localhost:${env_1.env.port}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
startServer();
