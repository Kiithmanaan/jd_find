import { loadEnvFile } from "../config/load-env.js";
import { createProductionApp } from "./production-app.js";

loadEnvFile();

const app = createProductionApp();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

await app.listen({ port, host });
