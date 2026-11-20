// Opens, updates or closes the issue "Card coverage gaps" from data/coverage/report.json (full) or release.json (release),
// with the gh CLI and the run's own token. Runs only on main: a test branch never files issues.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ExternalGap, SiteGaps } from "../src/lib/coverage";

const TITLE = "Card coverage gaps";
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== "main") {
  console.log(`Not on main (${process.env.GITHUB_REF_NAME}): no issue.`);
  process.exit(0);
}
const dir = path.join(process.cwd(), "data", "coverage");
const file = ["release.json", "report.json"]
  .map((f) => path.join(dir, f))
  .filter((f) => fs.existsSync(f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!file) process.exit(0);
const r = JSON.parse(fs.readFileSync(file, "utf8")) as { mode: string; sites: SiteGaps[]; external: ExternalGap[] };
const gaps = r.sites.filter((s) => s.missing > 0);
const md = fs.readFileSync(file.replace(/\.json$/, ".md"), "utf8");
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8" }).trim();
const open = gh("issue", "list", "--state", "open", "--search", `"${TITLE}" in:title`, "--json", "number", "--jq", ".[0].number");

if (!gaps.length) {
  if (open && r.mode === "full") gh("issue", "close", open, "--comment", "The full coverage audit found no missing card. Closing.");
  console.log("No gap against TCGplayer.");
  process.exit(0);
}
const body = [
  `${gaps.reduce((n, s) => n + s.missing, 0)} cards TCGplayer lists have no page (${r.mode} audit). The sites import every TCGplayer group daily, so a gap that stays two days means an import is failing or a filter drops real cards: fix the filter, never hand-edit data/.`,
  "",
  md.slice(0, 60_000),
].join("\n");
if (open) gh("issue", "comment", open, "--body", body);
else gh("issue", "create", "--title", TITLE, "--body", body);
