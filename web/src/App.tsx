import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Route, Routes, useParams } from "react-router-dom";
import { getDueCards } from "./api.js";
import Icon from "./components/Icon.js";
import Library from "./pages/Library.js";
import Lesson from "./pages/Lesson.js";
import Study from "./pages/Study.js";

/** Cards waiting — the one number the app exists to drive to zero. */
const DueContext = createContext<{ due: number | null; refreshDue: () => void }>({
  due: null,
  refreshDue: () => {},
});

export const useDue = () => useContext(DueContext);

function LessonRoute() {
  const { packageId, lessonId } = useParams();
  return <Lesson key={`${packageId}/${lessonId}`} />;
}

export default function App() {
  const [due, setDue] = useState<number | null>(null);

  const refreshDue = useCallback(() => {
    getDueCards()
      .then((cards) => setDue(cards.length))
      .catch(() => setDue(null));
  }, []);

  useEffect(() => {
    refreshDue();
  }, [refreshDue]);

  return (
    <DueContext.Provider value={{ due, refreshDue }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <header className="rail">
          <div className="rail-inner">
            <p className="mark">
              <em>Study</em>
            </p>
            <nav className="nav" aria-label="Main">
              <NavLink className="nav-item" to="/" end>
                <Icon name="library" />
                Library
              </NavLink>
              <NavLink className="nav-item" to="/study">
                <Icon name="study" />
                Study
                {due !== null && due > 0 && (
                  <span className="due-badge">
                    {due}
                    <span className="sr-only"> cards due</span>
                  </span>
                )}
              </NavLink>
            </nav>
            <p className="rail-foot">
              Everything stays on this machine.
              <br />
              data/study.db
            </p>
          </div>
        </header>
        <main className="content" id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/lesson/:packageId/:lessonId" element={<LessonRoute />} />
            <Route path="/study" element={<Study />} />
          </Routes>
        </main>
      </div>
    </DueContext.Provider>
  );
}
