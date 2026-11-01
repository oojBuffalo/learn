import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { getDueCards } from "./api.js";
import Icon from "./components/Icon.js";
import Library from "./pages/Library.js";
import Lesson from "./pages/Lesson.js";
import Study from "./pages/Study.js";
import Quizzes from "./pages/Quizzes.js";
import Games from "./pages/Games.js";
import Quiz from "./pages/Quiz.js";
import Game from "./pages/Game.js";
import Home from "./pages/Home.js";
import Notes from "./pages/Notes.js";
import NoteEditor from "./pages/NoteEditor.js";
import ExplanationEditor from "./pages/ExplanationEditor.js";

/** Cards waiting — the one number the app exists to drive to zero. */
const DueContext = createContext<{ due: number | null; refreshDue: () => Promise<void> }>({
  due: null,
  refreshDue: () => Promise.resolve(),
});

export const useDue = () => useContext(DueContext);

function LessonRoute() {
  const { packageId, lessonId } = useParams();
  return <Lesson key={`${packageId}/${lessonId}`} />;
}

function QuizRoute() {
  const { packageId, quizId } = useParams();
  return <Quiz key={`${packageId}/${quizId}`} />;
}

function GameRoute() {
  const { packageId, gameId } = useParams();
  return <Game key={`${packageId}/${gameId}`} />;
}

function NoteRoute() {
  const { noteId } = useParams();
  const location = useLocation();
  const key = (location.state as { editorKey?: string } | null)?.editorKey ?? noteId ?? `new:${location.key}`;
  return <NoteEditor key={key} editorKey={key} />;
}

function ExplanationRoute() {
  const { explanationId } = useParams();
  const location = useLocation();
  const key = (location.state as { editorKey?: string } | null)?.editorKey ?? explanationId ?? `new:${location.key}`;
  return <ExplanationEditor key={key} editorKey={key} />;
}

export default function App() {
  const [due, setDue] = useState<number | null>(null);

  const refreshDue = useCallback((): Promise<void> => {
    return getDueCards()
      .then((cards) => setDue(cards.length))
      .catch(() => setDue(null));
  }, []);

  useEffect(() => {
    refreshDue();
    const visible = () => { if (document.visibilityState === "visible") void refreshDue(); };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
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
              <NavLink className="nav-item" to="/" end><Icon name="home" /><span className="nav-label">Home</span></NavLink>
              <NavLink className="nav-item" to="/library">
                <Icon name="library" />
                <span className="nav-label">Library</span>
              </NavLink>
              <NavLink className="nav-item" to="/study">
                <Icon name="study" />
                <span className="nav-label">Study</span>
                {due !== null && due > 0 && (
                  <span className="due-badge">
                    {due}
                    <span className="sr-only"> cards due</span>
                  </span>
                )}
              </NavLink>
              <NavLink className="nav-item" to="/quizzes"><Icon name="quiz" /><span className="nav-label">Quizzes</span></NavLink>
              <NavLink className="nav-item" to="/games"><Icon name="game" /><span className="nav-label">Games</span></NavLink>
              <NavLink className="nav-item" to="/notes"><Icon name="note" /><span className="nav-label">Notes</span></NavLink>
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
            <Route path="/" element={<Home />} />
            <Route path="/library" element={<Library />} />
            <Route path="/lesson/:packageId/:lessonId" element={<LessonRoute />} />
            <Route path="/study" element={<Study />} />
            <Route path="/quizzes" element={<Quizzes />} />
            <Route path="/quizzes/:packageId/:quizId" element={<QuizRoute />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/:packageId/:gameId" element={<GameRoute />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/new" element={<NoteRoute />} />
            <Route path="/notes/:noteId" element={<NoteRoute />} />
            <Route path="/notes/explain/new" element={<ExplanationRoute />} />
            <Route path="/notes/explain/:explanationId" element={<ExplanationRoute />} />
          </Routes>
        </main>
      </div>
    </DueContext.Provider>
  );
}
