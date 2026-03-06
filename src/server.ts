// server.ts

import "dotenv/config";



import { app} from "./app";


import "./config/db";

//import walletRoutes from "./modules/wallets/wallet.route";



const start = async () => {
    try {
        await app.listen({port: Number(process.env.PORT), host: "0.0.0.0"})
        console.log(`Server is running on port ${process.env.PORT}`);
        console.log(`🗄️  Database: ${process.env.DB_URL ? 'Configured' : 'Using defaults'}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();