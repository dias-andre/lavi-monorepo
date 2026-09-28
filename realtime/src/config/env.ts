import Type from "typebox";
import Value from "typebox/value";
import { logger } from "./logger";

const envSchema = Type.Object({
  // Axios needs a URL with a scheme (for example, http://api:3000).
  API_ADDR: Type.String(),
  WS_PORT: Type.String(),
  REDIS_HOST: Type.String({ format: "idn-hostname" }),
  REDIS_PORT: Type.String(),
});

export function validateEnv() {
  logger.info("Checking Environment...");
  const errors = [...Value.Errors(envSchema, process.env)];
  if (errors.length > 0) {
    errors.map((err) => logger.fatal(`${err.instancePath} ${err.message}`));
    process.exit(1);
  }
  logger.info("Environment ok!");
}
