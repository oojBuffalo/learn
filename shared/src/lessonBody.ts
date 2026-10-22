import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { MATH_OPTIONS } from "./mathSource.js";

const DIRECTIVE_RE = /^::activity\{id="([A-Za-z0-9][A-Za-z0-9_-]*)"\}[ \t]*$/;

/** The player's Markdown dialect, so an activity found here is one it will render. */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath, MATH_OPTIONS);

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/**
 * The activity a top-level Markdown node stands for, if any.
 *
 * A directive is a paragraph that is nothing but `::activity{id="…"}`, written as its
 * own block at the top level of the lesson. Deciding this on parsed nodes rather than
 * raw lines is what keeps code samples, list items and quotes that merely contain
 * directive text from being mistaken for one.
 *
 * Args:
 *   node: A child of the lesson's mdast root.
 *
 * Returns:
 *   The activity's item id, or null when the node is ordinary content.
 */
export function directiveId(node: MdNode): string | null {
  if (node.type !== "paragraph" || node.children?.length !== 1) return null;
  const [only] = node.children;
  if (only?.type !== "text" || only.value === undefined) return null;
  return DIRECTIVE_RE.exec(only.value)?.[1] ?? null;
}

/**
 * Item ids of the activities embedded in a lesson body, in reading order.
 *
 * Args:
 *   body: The lesson's Markdown.
 *
 * Returns:
 *   One id per directive, repeats included.
 */
export function activityIdsInBody(body: string): string[] {
  const root = parser.parse(body) as MdNode;
  return (root.children ?? []).flatMap((node) => {
    const id = directiveId(node);
    return id ? [id] : [];
  });
}
