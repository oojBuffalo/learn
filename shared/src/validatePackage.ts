import type { Game, LessonFrontmatter, Manifest, Quiz } from "./packageSchema.js";
import type { Item } from "./items.js";
import { activityIdsInBody } from "./lessonBody.js";

export interface LoadedLesson {
  frontmatter: LessonFrontmatter;
  body: string;
  file: string;
  order: number;
}
export interface LoadedPackage {
  manifest: Manifest;
  lessons: LoadedLesson[];
  items: Item[];
  quizzes: Quiz[];
  games: Game[];
  assets: { path: string; data: Uint8Array }[];
}
export interface PackageError {
  file: string;
  path: string;
  message: string;
}

const GAME_COMPAT: Record<Game["template"], Item["type"][]> = {
  matching: ["matching"],
  "timed-round": ["multiple-choice", "multi-select"],
  "order-it": ["ordering"],
};

export function validatePackage(pkg: LoadedPackage): PackageError[] {
  const errs: PackageError[] = [];
  const err = (file: string, path: string, message: string) => errs.push({ file, path, message });

  const itemIds = new Map<string, Item>();
  for (const item of pkg.items) {
    if (itemIds.has(item.id)) err("items.json", item.id, `duplicate item id "${item.id}"`);
    itemIds.set(item.id, item);
  }
  const lessonIds = new Set<string>();
  for (const l of pkg.lessons) {
    if (lessonIds.has(l.frontmatter.id)) err(l.file, "id", `duplicate lesson id "${l.frontmatter.id}"`);
    lessonIds.add(l.frontmatter.id);
  }
  const assetPaths = new Set(pkg.assets.map((a) => a.path));

  for (const l of pkg.lessons) {
    for (const id of activityIdsInBody(l.body)) {
      if (!itemIds.has(id)) err(l.file, "body", `activity directive references missing item "${id}"`);
    }
    for (const id of l.frontmatter.activities ?? []) {
      if (!itemIds.has(id)) err(l.file, "activities", `activities references missing item "${id}"`);
    }
    for (const id of l.frontmatter.prerequisites ?? []) {
      if (!lessonIds.has(id)) err(l.file, "prerequisites", `prerequisite references missing lesson "${id}"`);
    }
    for (const m of l.body.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)) {
      const p = m[1]!;
      if (!assetPaths.has(p)) err(l.file, "body", `image references missing asset "${p}"`);
    }
  }

  const unitIds = new Set<string>();
  const unitLessonIds = new Set<string>();
  for (const u of pkg.manifest.units ?? []) {
    if (unitIds.has(u.id)) err("manifest.json", `units.${u.id}`, `duplicate unit id "${u.id}"`);
    unitIds.add(u.id);
    for (const id of u.lessonIds) {
      if (unitLessonIds.has(id)) {
        err("manifest.json", `units.${u.id}`, `lesson "${id}" appears in more than one unit position`);
      }
      unitLessonIds.add(id);
      if (!lessonIds.has(id)) err("manifest.json", `units.${u.id}`, `unit references missing lesson "${id}"`);
    }
  }

  const quizIds = new Set<string>();
  for (const q of pkg.quizzes) {
    if (quizIds.has(q.id)) err("quizzes.json", q.id, `duplicate quiz id "${q.id}"`);
    quizIds.add(q.id);
    for (const id of q.items) {
      if (!itemIds.has(id)) err("quizzes.json", q.id, `quiz references missing item "${id}"`);
      else if (itemIds.get(id)!.type === "flashcard")
        err("quizzes.json", q.id, `quiz item "${id}" is a flashcard (not quizzable)`);
    }
  }

  const gameIds = new Set<string>();
  for (const g of pkg.games) {
    if (gameIds.has(g.id)) err("games.json", g.id, `duplicate game id "${g.id}"`);
    gameIds.add(g.id);
    const compat = GAME_COMPAT[g.template];
    const source =
      "itemIds" in g.source
        ? g.source.itemIds.map((id) => {
            if (!itemIds.has(id)) err("games.json", g.id, `game references missing item "${id}"`);
            return itemIds.get(id);
          })
        : pkg.items.filter((i) => i.tags?.some((t) => (g.source as { tags: string[] }).tags.includes(t)));
    const usable = source.filter((i): i is Item => !!i && compat.includes(i.type));
    if (usable.length === 0)
      err("games.json", g.id, `game "${g.id}" (${g.template}) has no compatible items (needs: ${compat.join("/")})`);
  }

  for (const item of pkg.items) {
    for (const m of item.media ?? []) {
      if (!assetPaths.has(m.src)) err("items.json", item.id, `media references missing asset "${m.src}"`);
    }
  }

  return errs;
}
