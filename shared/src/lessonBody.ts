export type BodySegment = { kind: "md"; md: string } | { kind: "activity"; id: string };

const DIRECTIVE_RE = /^::activity\{id="([A-Za-z0-9][A-Za-z0-9_-]*)"\}[ \t]*$/;

export function splitLessonBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) segments.push({ kind: "md", md: buf.join("\n") });
    buf = [];
  };
  for (const line of body.split("\n")) {
    const m = DIRECTIVE_RE.exec(line);
    if (m && m[1]) {
      flush();
      segments.push({ kind: "activity", id: m[1] });
    } else {
      buf.push(line);
    }
  }
  flush();
  return segments.length ? segments : [{ kind: "md", md: "" }];
}

export function activityIdsInBody(body: string): string[] {
  return splitLessonBody(body)
    .filter((s): s is Extract<BodySegment, { kind: "activity" }> => s.kind === "activity")
    .map((s) => s.id);
}
