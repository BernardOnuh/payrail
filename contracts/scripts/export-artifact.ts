import { mkdirSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  const artifactPath = join(root, "artifacts/contracts/PayrailRouter.sol/PayrailRouter.json");
  const outDir = join(root, "export");
  const outPath = join(outDir, "PayrailRouter.json");

  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const slim = {
    _format: artifact._format,
    contractName: artifact.contractName,
    sourceName: artifact.sourceName,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    deployedBytecode: artifact.deployedBytecode,
    linkReferences: artifact.linkReferences,
  };

  mkdirSync(outDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(slim, null, 2));
  console.log(`wrote slim artifact -> ${outPath} (${(await stat(outPath)).size} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});