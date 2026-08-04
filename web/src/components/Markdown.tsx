import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ packageId, children }: { packageId: string; children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        url.startsWith("assets/") ? `/api/packages/${packageId}/${url}` : url
      }
    >
      {children}
    </ReactMarkdown>
  );
}
