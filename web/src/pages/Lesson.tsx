import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { activityIdsInBody, splitLessonBody } from "@study/shared";
import { getLesson, setProgress, type LessonPayload } from "../api.js";
import ActivityView from "../components/ActivityView.js";
import Markdown from "../components/Markdown.js";

export default function Lesson() {
  const { packageId = "", lessonId = "" } = useParams();
  const [data, setData] = useState<LessonPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLesson(packageId, lessonId)
      .then((d) => {
        setData(d);
        if (d.progress === "not-started") {
          setProgress(packageId, lessonId, "in-progress").catch(() => {});
        }
      })
      .catch((e) => setError(String(e)));
  }, [packageId, lessonId]);

  if (error) return <p className="incorrect">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const segments = splitLessonBody(data.lesson.body);
  const embedded = new Set(activityIdsInBody(data.lesson.body));
  const extra = (data.lesson.frontmatter.activities ?? []).filter((id) => !embedded.has(id));
  const done = data.progress === "completed";

  return (
    <>
      <p><Link to="/">← Library</Link></p>
      <h1>{data.lesson.title}</h1>
      {segments.map((seg, i) =>
        seg.kind === "md" ? (
          <Markdown key={"md-" + i} packageId={packageId}>{seg.md}</Markdown>
        ) : data.items[seg.id] ? (
          <ActivityView key={seg.id} packageId={packageId} item={data.items[seg.id]!} />
        ) : null,
      )}
      {extra.length > 0 && <h2>Practice</h2>}
      {extra.map((id) =>
        data.items[id] ? <ActivityView key={id} packageId={packageId} item={data.items[id]!} /> : null,
      )}
      <p>
        <button className="primary" disabled={done}
          onClick={() => setProgress(packageId, lessonId, "completed").then(() => setData({ ...data, progress: "completed" }))}>
          {done ? "✓ Lesson completed" : "Mark lesson complete"}
        </button>
      </p>
    </>
  );
}
