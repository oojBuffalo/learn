import type { Answer, QuizItemResult } from "@study/shared";
import { AnswerForm, ItemPrompt, TYPE_LABEL, Verdict } from "./ActivityView.js";
import type { Task } from "./ActivityView.js";

export default function QuizQuestion({ packageId, item, index, total, locked, result, onChange }: {
  packageId: string; item: Task; index: number; total: number; locked: boolean;
  result: QuizItemResult | null; onChange: (itemId: string, draft: Answer | null) => void;
}) {
  return <section className="work">
    <ItemPrompt packageId={packageId} item={item} kicker={`Question ${index + 1} of ${total} · ${TYPE_LABEL[item.type]}`} />
    <AnswerForm item={item} disabled={locked} onChange={(draft) => onChange(item.id, draft)} />
    {result && <Verdict packageId={packageId} item={item} result={result} answered={result.answered} />}
  </section>;
}
