import { SPHERE_APPLICATIONS } from "../shared/modules/shell/applications.js";

const common = `  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    -Server
  }`;

const applications = Object.entries(SPHERE_APPLICATIONS);
const upstream = id => id ? `rollapp-${id}:8080` : "127.0.0.1:8080";
const ownedApi = applications.map(([id, { api }]) => {
  const paths = api.flatMap(prefix => [prefix, `${prefix}/*`]).join(" ");
  return `  @${id}_api path ${paths}
  handle @${id}_api {
    reverse_proxy ${upstream(id)}
  }`;
}).join("\n");

const site = (host, id) => `${host} {
${common}
${id ? `  handle /api/healthz {
    reverse_proxy ${upstream(id)}
  }` : ""}
${ownedApi}
${id ? `  @platform path /api /api/* /mcp /tonconnect-manifest.json
  handle @platform {
    reverse_proxy ${upstream()}
  }` : ""}
  handle {
    reverse_proxy ${upstream(id)}
  }
}`;

console.log([
  site("{$PUBLIC_HOST}", null),
  ...applications.map(([id, { host }]) => site(host, id)),
].join("\n\n"));
