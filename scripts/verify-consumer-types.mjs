// Verifies the packed tarball works for real-world consumers:
//  1. A CommonJS package (module: node16) statically importing the
//     package by name must typecheck with zero suppressions (TS1479).
//  2. Re-exporting `RequestContext.middleware(...)` under
//     `declaration: true` must emit cleanly (TS4023).
// Run via: npm run test:fixtures
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = join(root, "node_modules", "typescript", "lib", "tsc.js");
const fixture = join(root, "fixtures", "cjs-consumer");

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });
}

const workdir = mkdtempSync(join(tmpdir(), "ack-consumer-"));
try {
  // Fresh build + pack, exactly as published to npm.
  sh("npm", ["run", "build"], root);
  const packOut = sh("npm", ["pack", "--pack-destination", workdir], root);
  const tarballName = packOut.trim().split("\n").pop();
  const tarball = join(workdir, tarballName);

  // Assemble the fixture against the tarball.
  const consumerDir = join(workdir, "consumer");
  mkdirSync(consumerDir, { recursive: true });
  for (const file of [
    "package.json",
    "tsconfig.json",
    "tsconfig.declaration.json",
    "consumer.ts",
    "reexport.ts",
  ]) {
    cpSync(join(fixture, file), join(consumerDir, file));
  }
  // The fixture package.json is documentation (private, never
  // installed); the temp copy needs no dev-only fields.
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "cjs-consumer-fixture",
        private: true,
        version: "0.0.0",
        type: "commonjs",
      },
      null,
      2,
    ) + "\n",
  );
  sh(
    "npm",
    ["install", tarball, "--no-audit", "--no-fund", "--no-save"],
    consumerDir,
  );

  // Check 1: CJS static import typechecks (TS1479).
  sh("node", [tsc, "-p", "tsconfig.json"], consumerDir);
  console.log("consumer check OK: CJS static import typechecks (no TS1479)");

  // Check 2: middleware re-export emits declarations (TS4023).
  sh("node", [tsc, "-p", "tsconfig.declaration.json"], consumerDir);
  console.log(
    "consumer check OK: middleware re-export emits declarations (no TS4023)",
  );
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

console.log("consumer fixture verification OK");
