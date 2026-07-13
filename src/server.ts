// server.ts

import "dotenv/config";

import { app } from "./app";
import { initSupportSocket } from "./modules/support/support.socket";

import "./config/db";

const start = async () => {
  try {
    await app.ready();
    const httpServer = app.server;
    initSupportSocket(httpServer);

    await app.listen({ port: Number(process.env.PORT), host: "0.0.0.0" });
    console.log(`Server is running on port ${process.env.PORT}`);
    console.log(`Socket.IO support chat enabled at /socket.io`);
    console.log(`Database: ${process.env.DB_URL ? "Configured" : "Using defaults"}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
