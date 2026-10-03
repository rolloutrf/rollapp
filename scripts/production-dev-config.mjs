export function productionConnectionMode(environment) {
  if (!environment.DATABASE_URL?.trim() && !environment.PGHOST?.trim()) {
    throw new Error("Production PostgreSQL не настроен: укажите DATABASE_URL или PGHOST. Демо-база отключена.");
  }
  const mode = environment.ROLLAPP_DATABASE_CONNECTION || "direct";
  if (!["direct", "tunnel"].includes(mode)) throw new Error("ROLLAPP_DATABASE_CONNECTION должен быть direct или tunnel.");
  return mode;
}

export function developmentFrontendPort(environment) {
  const port = Number(environment.ROLLAPP_DEV_FRONTEND_PORT || 5172);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("ROLLAPP_DEV_FRONTEND_PORT должен быть портом от 1 до 65535.");
  return port;
}
