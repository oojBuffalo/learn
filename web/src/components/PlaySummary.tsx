import { useEffect, useRef } from "react";

export default function PlaySummary({ text }: { text: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <h2 className="play-summary" tabIndex={-1} ref={heading}>{text}</h2>;
}
