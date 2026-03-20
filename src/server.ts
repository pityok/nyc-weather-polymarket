import "dotenv/config";
import app from "./app.js";
import { config } from "./config/index.js";
import { startCopytradeScheduler, startForecastScheduler } from "./jobs/index.js";
import { initializeCopytradeState } from "./services/copytrade.service.js";

await initializeCopytradeState();

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  startForecastScheduler();
  startCopytradeScheduler();
});

export default server;
