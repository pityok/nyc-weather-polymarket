import "dotenv/config";
import app from "./app.js";
import { config } from "./config/index.js";
import { startForecastScheduler } from "./jobs/index.js";

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  startForecastScheduler();
});

export default server;
