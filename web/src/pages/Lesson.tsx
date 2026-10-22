import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { activityIdsInBody } from "@study/shared";
import { getLesson, setProgress, type LessonPayload } from "../api.js";
import ActivityView from "../components/ActivityView.js";
import Icon from "../components/Icon.js";
import { LessonMarkdown } from "../components/Markdown.js";

interface Frontmatter {
  summary?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  tags?: string[];
  activities?: string[];
}

export default function Lesson() {
  const { packageId = "", lessonId = "" } = useParams();
  const [data, setData] = useState<LessonPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getLesson(packageId, lessonId)
      .then((d) => {
        setData(d);
        if (d.progress === "not-started") {
          setProgress(packageId, lessonId, "in-progress").catch(() => {});
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [packageId, lessonId]);

  if (error) {
    return (
      <div className="page">
        <div className="errors" role="alert">
          <strong>This lesson didn’t load.</strong>
          <p>{error}</p>
          <p>
            <Link to="/">Back to the library</Link>
          </p>
        </div>
      </div>
    );
  }
  if (!data) return <p className="loading">Loading…</p>;

  const fm = data.lesson.frontmatter as Frontmatter;
  const embedded = new Set(activityIdsInBody(data.lesson.body));
  const extra = (fm.activities ?? []).filter((id) => !embedded.has(id));
  const done = data.progress === "completed";
  const facts = [fm.difficulty, fm.estimatedMinutes ? `${fm.estimatedMinutes} min read` : null, ...(fm.tags ?? [])]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="page">
      <Link className="back-link" to="/">
        <Icon name="left" size={18} />
        Library
      </Link>

      <header className="page-head">
        {facts && <p className="eyebrow">{facts}</p>}
        <h1 className="page-title">{data.lesson.title}</h1>
        {fm.summary && <p className="page-sub">{fm.summary}</p>}
      </header>

      <LessonMarkdown
        packageId={packageId}
        activity={(id) => (data.items[id] ? <ActivityView packageId={packageId} item={data.items[id]!} /> : null)}
      >
        {data.lesson.body}
      </LessonMarkdown>

      {extra.length > 0 && (
        <>
          <h2 className="eyebrow section-break">Practice</h2>
          {extra.map((id) =>
            data.items[id] ? <ActivityView key={id} packageId={packageId} item={data.items[id]!} /> : null,
          )}
        </>
      )}

      <div className="finish">
        <p className="note">
          {done ? "You’ve finished this lesson. Its cards keep coming back in Study." : "Done reading? Mark it complete."}
        </p>
        <button
          className="btn btn-primary"
          disabled={done}
          onClick={() => {
            setSaveError(null);
            setProgress(packageId, lessonId, "completed")
              .then(() => setData((d) => d && { ...d, progress: "completed" }))
              .catch((e) => setSaveError(e instanceof Error ? e.message : String(e)));
          }}
        >
          {done ? "✓ Lesson completed" : "Mark lesson complete"}
        </button>
        {saveError && (
          <p className="errors" role="alert">
            Your progress wasn’t saved ({saveError}). Try again in a moment.
          </p>
        )}
      </div>
    </div>
  );
}
