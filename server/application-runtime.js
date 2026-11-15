import { SPHERE_APPLICATIONS, sphereApiOwner } from "../shared/applications.js";

export function applicationRuntime(environment) {
  const id = environment.ROLLAPP_APPLICATION || "platform";
  if (id === "platform") return { id, sphere: null };
  if (!Object.hasOwn(SPHERE_APPLICATIONS, id)) throw new Error(`Unknown Rollapp application: ${id}`);
  if (environment.ROLLAPP_DATABASE_INITIALIZATION !== "verify") {
    throw new Error(`Rollapp ${id} requires ROLLAPP_DATABASE_INITIALIZATION=verify`);
  }
  return { id, sphere: SPHERE_APPLICATIONS[id] };
}

export function requireApplicationApi(id) {
  return (req, res, next) => {
    if (req.path === "/healthz" || sphereApiOwner(`/api${req.path}`) === id) return next();
    res.status(404).json({ error: "Маршрут API не найден" });
  };
}
