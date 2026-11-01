import { useEffect, useRef, useState } from "react";
import type { CheckableItem, CheckResult, GameDeal, GameMove, GameMoveResult } from "@study/shared";
import { AnswerForm, ItemPrompt, TYPE_LABEL, Verdict } from "./ActivityView.js";

export default function ItemRun({ packageId, items, deal, disabled, check, onDone }: {
  packageId: string;
  items: readonly CheckableItem[];
  deal: Extract<GameDeal, { template: "timed-round" | "order-it" }>;
  disabled: boolean;
  check: (move: GameMove) => Promise<GameMoveResult | null>;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [verdict, setVerdict] = useState<CheckResult | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (verdict) nextButton.current?.focus(); }, [verdict]);
  const itemId = deal.itemIds[index]!;
  const item = items.find((candidate) => candidate.id === itemId)!;
  return (
    <section className="work">
      <ItemPrompt packageId={packageId} item={item} kicker={`Question ${index + 1} of ${deal.itemIds.length} · ${TYPE_LABEL[item.type]}`} />
      <div className="work-body">
        <AnswerForm key={index} item={item} disabled={disabled || verdict !== null} onSubmit={async (answer) => {
          const result = await check({ itemId, answer });
          if (result && "score" in result) setVerdict(result);
        }} />
      </div>
      {verdict && <Verdict packageId={packageId} item={item} result={verdict}>
        <div className="actions">
          <button className="btn btn-primary" ref={nextButton} disabled={disabled} onClick={() => {
            if (index === deal.itemIds.length - 1) onDone();
            else { setVerdict(null); setIndex(index + 1); }
          }}>{index === deal.itemIds.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </Verdict>}
    </section>
  );
}
