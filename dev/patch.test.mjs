// Unit test for lib/patch.js against the real ~/.dsh/profiles/web/cordis.patch.yml shape.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendInsert, dumpPatch, listManagedRows, parsePatch, removeInsert, setDisabled } from "../lib/patch.js";

let failures = 0;
function check(label, cond, extra = "") {
  if (cond) console.log("  PASS", label);
  else { failures += 1; console.log("  FAIL", label, extra); }
}

const realPath = join(homedir(), ".dsh", "profiles", "web", "cordis.patch.yml");
const content = readFileSync(realPath, "utf8");

console.log("== real file parse ==");
const rows = parsePatch(content);
check("parses to array", Array.isArray(rows));
console.log("  rows:", rows.length, "| webserver row:", JSON.stringify(rows[0]?.id), "| js expr:", JSON.stringify(rows[0]?.config?.port));
const managed = listManagedRows(rows);
console.log("  managed:", managed.map(m => m.id + (m.disabled ? "(off)" : "")));
check("deepseek-usage row", managed.some(m => m.id === "deepseek-usage" && !m.disabled));
check("voice-input row", managed.some(m => m.id === "dsh-plugin-voice-input"));
check("webserver not managed", !managed.some(m => m.id === "webserver"));

console.log("== appendInsert ==");
let edited = appendInsert(content, { id: "test-plugin-a", name: "dsh-plugin-test-a" });
const rowsA = parsePatch(edited);
const managedA = listManagedRows(rowsA);
check("row appended", managedA.some(m => m.id === "test-plugin-a" && m.name === "dsh-plugin-test-a"));
check("comments preserved (webserver comment)", edited.includes("对局域网开放"));
check("webserver row intact", rowsA[0]?.config?.port?.__jsExpr === "ctx.webStartup.port ?? 3080");

console.log("== setDisabled (disable) ==");
edited = setDisabled(edited, "test-plugin-a", true);
const rowsB = parsePatch(edited);
check("still parses", Array.isArray(rowsB));
const managedB = listManagedRows(rowsB);
check("test-plugin-a disabled", managedB.find(m => m.id === "test-plugin-a")?.disabled === true);
check("override row appended", /^\- id: test-plugin-a\s*$/m.test(edited) && /disabled: true/.test(edited));
check("other rows untouched", managedB.find(m => m.id === "deepseek-usage")?.disabled === false);

console.log("== setDisabled (enable again) ==");
edited = setDisabled(edited, "test-plugin-a", false);
const rowsC = parsePatch(edited);
const managedC = listManagedRows(rowsC);
check("test-plugin-a enabled", managedC.find(m => m.id === "test-plugin-a")?.disabled === false);
check("override removed", !/\n\- id: test-plugin-a\s*\n  disabled: true/.test(edited));

console.log("== setDisabled on existing (disable deepseek-usage) ==");
let edited2 = setDisabled(edited, "deepseek-usage", true);
const rowsD = parsePatch(edited2);
const managedD = listManagedRows(rowsD);
check("deepseek-usage disabled", managedD.find(m => m.id === "deepseek-usage")?.disabled === true);
check("webserver js expr survives", rowsD[0]?.config?.port?.__jsExpr === "ctx.webStartup.port ?? 3080");
edited2 = setDisabled(edited2, "deepseek-usage", false);
check("deepseek-usage re-enabled", listManagedRows(parsePatch(edited2)).find(m => m.id === "deepseek-usage")?.disabled === false);

console.log("== removeInsert ==");
let edited3 = removeInsert(edited, "test-plugin-a");
check("row removed", edited3 !== null && !listManagedRows(parsePatch(edited3)).some(m => m.id === "test-plugin-a"));
check("deepseek-usage still present", listManagedRows(parsePatch(edited3)).some(m => m.id === "deepseek-usage"));

console.log("== remove with disabled override ==");
let edited4 = setDisabled(edited3, "dsh-plugin-voice-input", true);
edited4 = removeInsert(edited4, "dsh-plugin-voice-input");
const rowsE = parsePatch(edited4);
check("voice-input removed incl override", !listManagedRows(rowsE).some(m => m.id === "dsh-plugin-voice-input"));
check("webserver comment kept", edited4.includes("对局域网开放"));

console.log("== missing id ==");
check("setDisabled unknown -> null", setDisabled(content, "nope", true) === null);
check("removeInsert unknown -> null", removeInsert(content, "nope") === null);

console.log("== dump round-trip ==");
const dumped = dumpPatch(rows);
const reParsed = parsePatch(dumped);
check("dump+parse stable", reParsed.length === rows.length && reParsed[0].config.port.__jsExpr === "ctx.webStartup.port ?? 3080");

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
