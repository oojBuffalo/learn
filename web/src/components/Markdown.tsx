import type { ReactNode } from "react";
import type { PluggableList } from "unified";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { KATEX_OPTIONS, MATH_OPTIONS } from "@study/shared";

/**
 * One dialect for the whole app. The importer parses with the same settings, so a
 * package that survives validation renders the way the author saw it.
 */
const remarkPlugins: PluggableList = [remarkGfm, [remarkMath, MATH_OPTIONS]];
const rehypePlugins: PluggableList = [[rehypeKatex, KATEX_OPTIONS]];

/** Wide tables scroll inside their own box rather than widening the page. */
const components = {
  table: (props: { children?: ReactNode }) => (
    <div className="table-scroll">
      <table>{props.children}</table>
    </div>
  ),
};

export default function Markdown({
  packageId,
  className = "prose",
  children,
}: {
  packageId: string;
  className?: string;
  children: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={(url) =>
          url.startsWith("assets/") ? `/api/packages/${packageId}/${url}` : defaultUrlTransform(url)
        }
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Nothing block-level can live inside a label, a table row or a bold run. */
const BLOCK_ELEMENTS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "table", "hr", "img",
];

/**
 * Phrasing-only Markdown for the short strings that sit inside form controls and
 * single-line rows — option text, ordering steps, hints and the like.
 *
 * Renders no wrapper of its own, so it drops straight into an existing element. Give
 * it one: every call site here is a flex container, where a bare fragment would turn
 * each inline node into its own flex item.
 *
 * There is no `packageId` and no `urlTransform` because `img` is disallowed, so an
 * `assets/…` reference can never appear in one of these fields.
 */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      disallowedElements={BLOCK_ELEMENTS}
      unwrapDisallowed
      components={{ p: ({ children }) => <>{children}</> }}
    >
      {children}
    </ReactMarkdown>
  );
}
