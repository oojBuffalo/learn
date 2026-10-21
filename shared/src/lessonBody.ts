export type BodySegment = { kind: "md"; md: string } | { kind: "activity"; id: string };

const DIRECTIVE_RE = /^::activity\{id="([A-Za-z0-9][A-Za-z0-9_-]*)"\}[ \t]*$/;
/** A CommonMark code fence: up to three spaces, then three or more ` or ~. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export function splitLessonBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) segments.push({ kind: "md", md: buf.join("\n") });
    buf = [];
  };
  // Inside a fenced code block a directive line is an example, not an activity.
  let fence: string | null = null;
  // CRLF files would leave a trailing \r that keeps a directive line from matching.
  for (const line of body.split(/\r?\n/)) {
    const f = FENCE_RE.exec(line);
    if (fence === null && f && !(f[1]![0] === "`" && f[2]!.includes("`"))) {
      fence = f[1]!;
    } else if (fence !== null && f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !f[2]!.trim()) {
      fence = null;
    }
    const m = fence === null ? DIRECTIVE_RE.exec(line) : null;
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
