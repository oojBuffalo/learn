import type { ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

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
        remarkPlugins={[remarkGfm]}
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
