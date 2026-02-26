import "dotenv/config";
import app from "./app.js";
import { config } from "./config/index.js";

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

export default server;
