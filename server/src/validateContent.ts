import { readPackageFolder } from "./packageFolder.js";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: npm run validate:content -- <package-dir>...");
  process.exit(2);
}

let failed = false;
for (const dir of dirs) {
  const { pkg, errors } = readPackageFolder(dir);
  if (errors.length > 0) {
    failed = true;
    console.error(`FAIL ${dir} — ${errors.length} error(s)`);
    for (const e of errors) {
      console.error(`  ${e.file} · ${e.path || "-"} · ${e.message}`);
    }
  } else {
    const p = pkg!;
    console.log(
      `OK   ${dir} — ${p.lessons.length} lessons, ${p.items.length} items, ` +
        `${p.quizzes.length} quizzes, ${p.games.length} games`,
    );
  }
}
process.exit(failed ? 1 : 0);
