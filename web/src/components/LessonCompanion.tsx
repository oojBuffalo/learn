import { Link } from "react-router-dom";
import { filterSearch } from "../listFilter.js";

export default function LessonCompanion({ packageId, lessonId }: { packageId: string; lessonId: string }) {
  const query = filterSearch({ kind: "package", packageId, lessonId });
  return <nav className="actions lesson-companion" aria-label="After this lesson">
    <Link className="btn" to={`/notes/explain/new${query}`}>Explain it back</Link>
    <Link className="btn" to={`/notes/new${query}`}>Write a note</Link>
    <Link className="link-btn" to={`/notes${query}`}>Your notes on this lesson</Link>
  </nav>;
}
