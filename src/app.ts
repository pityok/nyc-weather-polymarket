import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { errorHandler } from "./utils/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));
app.use(routes);
app.use(errorHandler);

export default app;
