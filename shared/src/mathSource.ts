import type { LoadedPackage } from "./validatePackage.js";

/**
 * Math dialect, shared by the browser renderer and the importer's validator so the
 * two can never disagree about what counts as math.
 */
export const MATH_OPTIONS = { singleDollarTextMath: true } as const;

/**
 * KaTeX settings, likewise shared. `trust: false` keeps `\href`, `\url` and
 * `\includegraphics` disabled; `maxSize` bounds `\rule` layout bombs, since packages
 * arrive as arbitrary zips. No `macros` key on purpose — KaTeX mutates that object
 * when it meets `\gdef`, which would leak definitions between expressions.
 *
 * `throwOnError` is absent because rehype-katex forbids it: it always renders with
 * errors thrown, catches them itself, and paints the source in `errorColor`.
 */
export const KATEX_OPTIONS = {
  trust: false,
  strict: "warn",
  maxSize: 50,
  errorColor: "var(--pen-red)",
} as const;

/**
 * How a string reaches the learner, which decides what may appear in it.
 *
 * - `block` — full Markdown, inline and display math.
 * - `inline` — phrasing Markdown and inline math. Display math is refused because the
 *   string sits inside a form control or a single-line row that cannot hold a block.
 * - `plain` — rendered verbatim as text. Math would show up as literal dollar signs.
 */
export type ProseMode = "block" | "inline" | "plain";

export interface Passage {
  file: string;
  path: string;
  text: string;
  mode: ProseMode;
}

/** Literal chunks of a fill-blank template, which the player renders separately. */
export function fillBlankSegments(template: string): string[] {
  return template.split(/\{\{\d+\}\}/);
}

/**
 * Every learner-visible string in a package, tagged with how it is rendered.
 *
 * This is the single source of truth for "which fields may contain math" — the
 * importer validates against it and `content/README.md` documents it. Frontmatter and
 * manifest prose are deliberately absent: they render verbatim, and they are long
 * enough that scanning them would misread ordinary dollar amounts as math.
 *
 * Args:
 *   pkg: The loaded package to walk.
 *
 * Returns:
 *   One passage per string, in file order.
 */
export function prosePassages(pkg: LoadedPackage): Passage[] {
  const out: Passage[] = [];
  const add = (file: string, path: string, text: string, mode: ProseMode) =>
    out.push({ file, path, text, mode });

  for (const lesson of pkg.lessons) add(lesson.file, "body", lesson.body, "block");

  for (const item of pkg.items) {
    const at = (suffix: string, text: string, mode: ProseMode) =>
      add("items.json", `${item.id}.${suffix}`, text, mode);

    if ("prompt" in item) at("prompt", item.prompt, "block");
    if (item.explanation) at("explanation", item.explanation, "block");
    item.hints?.forEach((hint, i) => at(`hints[${i}]`, hint, "inline"));

    switch (item.type) {
      case "multiple-choice":
      case "multi-select":
        item.options.forEach((option, i) => {
          at(`options[${i}].text`, option.text, "inline");
          if (option.feedback) at(`options[${i}].feedback`, option.feedback, "inline");
        });
        break;
      case "fill-blank":
        fillBlankSegments(item.template).forEach((segment, i) =>
          at(`template#${i}`, segment, "inline"),
        );
        item.blanks.forEach((blank, i) =>
          blank.accept.forEach((accepted, j) => at(`blanks[${i}].accept[${j}]`, accepted, "plain")),
        );
        break;
      case "short-answer":
        if (item.match !== "regex") {
          item.accept.forEach((accepted, i) => at(`accept[${i}]`, accepted, "plain"));
        }
        break;
      case "ordering":
        item.steps.forEach((step, i) => at(`steps[${i}].text`, step.text, "inline"));
        break;
      case "matching":
        item.pairs.forEach((pair, i) => {
          at(`pairs[${i}].left`, pair.left, "inline");
          at(`pairs[${i}].right`, pair.right, "plain");
        });
        item.distractors?.forEach((d, i) => at(`distractors[${i}]`, d, "plain"));
        break;
      case "flashcard":
        // Faces render through the block renderer, but `.answer p` is laid out inline
        // as a marker swipe, so a display-math block would tear it apart.
        at("front", item.front, "inline");
        at("back", item.back, "inline");
        item.examples?.forEach((example, i) => at(`examples[${i}]`, example, "inline"));
        break;
    }
  }

  return out;
}

/**
 * The plain-text reading of a prose string: math delimiters dropped, escaped dollars
 * restored. Good enough for aria-labels, and nothing more — `\frac{a}{b}` survives as
 * source, so authors are told to keep math simple wherever this is used.
 *
 * Args:
 *   text: The authored string.
 *
 * Returns:
 *   The string with balanced `$…$` and `$$…$$` delimiters removed. An unpaired dollar
 *   is left alone rather than guessed at.
 */
export function stripMath(text: string): string {
  return text.replace(/\\\$|\$\$([^]*?)\$\$|\$([^$\n]+?)\$/g, (match, display, inline) =>
    match === "\\$" ? "$" : (display ?? inline),
  );
}
