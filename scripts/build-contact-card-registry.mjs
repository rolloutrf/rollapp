import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runTolkCompiler, getTolkCompilerVersion } from "@ton/tolk-js";
const source = new URL("../contracts/contact-card-registry.tolk", import.meta.url);
const result = await runTolkCompiler({ entrypointFileName: "contact-card-registry.tolk", fsReadCallback: () => readFileSync(source, "utf8") });
if (result.status === "error") throw Error(result.message);
const artifact = { compiler: await getTolkCompilerVersion(), sourceHash: createHash("sha256").update(readFileSync(source)).digest("hex"), codeHash: result.codeHashHex, codeBoc64: result.codeBoc64, network: "-3", recoveryDelay: 604800 };
writeFileSync(new URL("../contracts/contact-card-registry.compiled.json", import.meta.url), JSON.stringify(artifact, null, 2) + "\n");
console.log("Contact card Testnet registry compiled:", artifact.codeHash);
