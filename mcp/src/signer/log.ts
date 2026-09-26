import { appendFileSync } from "node:fs";
import type { SignerLogSink } from "./signer.js";

/** Sink that logs each signature to stderr and, when configured, to an NDJSON file. */
export function makeLogSink(logFile: string): SignerLogSink {
  return {
    write(record) {
      const line = JSON.stringify(record);
      process.stderr.write(`[payrail-signer] ${line}\n`);
      if (logFile) {
        appendFileSync(logFile, `${line}\n`, { encoding: "utf8" });
      }
    },
  };
}