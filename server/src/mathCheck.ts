import katex from "katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { KATEX_OPTIONS, MATH_OPTIONS, prosePassages } from "@study/shared";
import type { LoadedPackage, PackageError, Passage } from "@study/shared";

/**
 * The browser's plugin stack, minus the rendering half. Parsing the same way the
 * player does is what makes this check trustworthy: code spans, fenced blocks and
 * `\$` escapes are excluded from math by the grammar itself rather than by a regex
 * that would have to be kept in step with it.
 */
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath, MATH_OPTIONS);

/** `strict` is quieter here than in the browser; it would log on every import. */
const CHECK_OPTIONS = { ...KATEX_OPTIONS, strict: "ignore", throwOnError: true } as const;

interface MathNode {
  type: string;
  value: string;
  position?: { start: { line: number; offset?: number }; end: { offset?: number } };
}

/** Lesson bodies are long enough that an author needs the line number. */
function where(passage: Passage, node: { position?: { start: { line: number } } }): string {
  if (passage.mode !== "block" || !node.position) return "";
  return `line ${node.position.start.line}: `;
}

function quote(tex: string): string {
  const flat = tex.replace(/\s+/g, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat;
}

/**
 * Report every math problem in a package.
 *
 * This exists because the renderer has no usable error channel: `rehype-katex`
 * catches KaTeX failures, files them on a vfile that react-markdown discards, and
 * paints the offending source red on the page. Without this pass an author's only
 * feedback would be a broken lesson in front of a learner.
 *
 * Args:
 *   pkg: The loaded package, already past schema and reference validation.
 *
 * Returns:
 *   One error per problem, in the same shape the importer already returns, so a
 *   single import reports all of them at once.
 */
export function validateMath(pkg: LoadedPackage): PackageError[] {
  const errors: PackageError[] = [];

  for (const passage of prosePassages(pkg)) {
    if (!passage.text.includes("$")) continue;

    const err = (message: string) =>
      errors.push({ file: passage.file, path: passage.path, message });
    const tree = processor.parse(passage.text);

    visit(tree, (node) => {
      if (node.type !== "inlineMath" && node.type !== "math") return;
      const math = node as unknown as MathNode;
      const display = node.type === "math";
      const at = where(passage, math);

      if (passage.mode === "plain") {
        err(
          `${at}math is not supported here — this field is shown as plain text, so ` +
            `"${quote(math.value)}" would reach the learner as literal dollar signs`,
        );
        return;
      }
      if (display && passage.mode === "inline") {
        err(`${at}display math ($$…$$) does not fit this field; use inline $…$ instead`);
        return;
      }
      try {
        katex.renderToString(math.value, { ...CHECK_OPTIONS, displayMode: display });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        err(`${at}${reason}`);
      }
    });

    // A dollar that is neither math nor escaped is almost always a delimiter the
    // author forgot to close, which would otherwise render as prose with no warning.
    // mdast unescapes `\$` into a bare `$`, so the original source has to be consulted.
    if (passage.mode !== "plain") {
      visit(tree, "text", (node) => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start === undefined || end === undefined) return;
        if (/(^|[^\\])\$/.test(passage.text.slice(start, end))) {
          err(
            `${where(passage, node)}unpaired $ — open and close inline math with ` +
              `$…$, or write a literal dollar sign as \\$`,
          );
        }
      });
    }
  }

  return errors;
}
