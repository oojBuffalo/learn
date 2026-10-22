import matter from "gray-matter";

const refuse = (): never => {
  throw new Error("frontmatter must be YAML");
};

/**
 * gray-matter honours a language named after the opening `---`, and its default
 * engines include `javascript`, which evaluates the block. Packages arrive as
 * arbitrary zips, so every non-YAML engine is replaced with one that refuses.
 */
const OPTIONS = { engines: { javascript: refuse, js: refuse, json: refuse, coffee: refuse, cson: refuse } };

/**
 * Split a lesson file into its YAML frontmatter and Markdown body.
 *
 * Args:
 *   source: The lesson file's text.
 *
 * Returns:
 *   The parsed frontmatter data and the body that follows it.
 *
 * Raises:
 *   Error: If the frontmatter names any language other than YAML, or the YAML
 *     itself does not parse.
 */
export function readLesson(source: string): { data: Record<string, unknown>; content: string } {
  const { name } = matter.language(source);
  if (name && name !== "yaml" && name !== "yml") {
    throw new Error(`frontmatter must be YAML, not "${name}"`);
  }
  const { data, content } = matter(source, OPTIONS);
  return { data, content };
}

/**
 * Write a lesson file: YAML frontmatter, then the body exactly as stored.
 *
 * `matter.stringify` re-parses a string argument with the default engines, so a body
 * that itself opens with a `---javascript` block would be evaluated. Handing it a
 * file object skips that parse and leaves the body untouched.
 *
 * Args:
 *   frontmatter: The lesson's frontmatter fields.
 *   body: The lesson's Markdown.
 *
 * Returns:
 *   The file's text.
 */
export function writeLesson(frontmatter: object, body: string): string {
  return matter.stringify({ content: body }, frontmatter, { ...OPTIONS, language: "yaml" });
}
