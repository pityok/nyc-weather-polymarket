import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import routes from "./routes/index.js";
import { errorHandler } from "./utils/errorHandler.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));
app.get("/", (_req, res) => res.redirect("/dashboard.html"));
app.use(routes);
app.use(errorHandler);

export default app;
