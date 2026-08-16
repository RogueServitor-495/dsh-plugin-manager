// dev/materialize-store.mjs — build a workspace-local profiles/node_modules for the
// dev DSH home so the sandboxed dev instance never touches ~/.dsh/profiles/node_modules.
// Every entry is symlinked from the npx-store app installation first, falling back to
// the real shared store for names the app does not carry.
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const devDir = join(import.meta.dirname, "..");
const nodeModulesRoot = "/Users/snake/.npm/_npx/1e7f6d9597241db0/node_modules";
const realStore = join(homedir(), ".dsh", "profiles", "node_modules");
const devStore = join(devDir, "dsh-home", "profiles", "node_modules");

// Safety: never follow a pre-existing symlink here (that could delete the real store).
if (existsSync(devStore) && lstatSync(devStore).isSymbolicLink()) rmSync(devStore, { force: true });
mkdirSync(devStore, { recursive: true });
for (const entry of readdirSync(devStore)) rmSync(join(devStore, entry), { recursive: true, force: true });

function linkEntry(name, realEntry) {
  const npxEntry = join(nodeModulesRoot, name);
  const linkTarget = join(devStore, name);
  if (name.startsWith("@") && existsSync(npxEntry) && existsSync(realEntry)) {
    mkdirSync(linkTarget, { recursive: true });
    for (const pkg of readdirSync(realEntry)) {
      const npxPkg = join(npxEntry, pkg);
      const source = existsSync(npxPkg) ? npxPkg : join(realEntry, pkg);
      if (existsSync(source)) symlinkSync(source, join(linkTarget, pkg));
    }
    return;
  }
  const source = existsSync(npxEntry) ? npxEntry : realEntry;
  if (existsSync(source)) symlinkSync(source, linkTarget);
}

for (const entry of readdirSync(realStore)) linkEntry(entry, join(realStore, entry));
console.log("dev store:", devStore);
console.log("entries:", readdirSync(devStore).length, "| @deepseek-ai:", readdirSync(join(devStore, "@deepseek-ai")).length);
