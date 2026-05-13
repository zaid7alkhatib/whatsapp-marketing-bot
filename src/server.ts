import app from "./app";
import { env } from "./config/env";
import { connectDatabase } from "./database/connect";
import { restoreConnectedBaileysAccounts } from "./integrations/baileys/baileys.service";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await restoreConnectedBaileysAccounts();

    app.listen(env.port, () => {
      console.log(`Server running on http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
