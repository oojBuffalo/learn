import { Link, Route, Routes } from "react-router-dom";
import Library from "./pages/Library.js";
import Lesson from "./pages/Lesson.js";
import Study from "./pages/Study.js";

export default function App() {
  return (
    <>
      <nav>
        <Link to="/">Library</Link>
        <Link to="/study">Study</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/lesson/:packageId/:lessonId" element={<Lesson />} />
          <Route path="/study" element={<Study />} />
        </Routes>
      </main>
    </>
  );
}
