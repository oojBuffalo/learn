import { useId } from "react";
import { CONFIDENCE_LEVELS } from "@study/shared";
import type { Confidence } from "@study/shared";

export const CONFIDENCE_LABEL: Record<Confidence, string> = { 1: "Lost", 2: "Shaky", 3: "Getting there", 4: "Solid", 5: "Could teach it" };
export default function ConfidencePicker({ value, onChange, disabled = false }: {
  value: Confidence | null; onChange: (c: Confidence) => void; disabled?: boolean;
}) {
  const group = useId();
  return <fieldset className="confidence">
    <legend>How well could you explain it?</legend>
    <div className="opts">{CONFIDENCE_LEVELS.map((n) => <label className="opt" key={n}>
      <input type="radio" name={group} value={n} checked={value === n} disabled={disabled} onChange={() => onChange(n)} />
      <span>{`${n} · ${CONFIDENCE_LABEL[n]}`}</span>
    </label>)}</div>
  </fieldset>;
}
export function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  return <span className={`chip chip-plain conf-chip${confidence <= 2 ? " is-low" : confidence >= 4 ? " is-high" : ""}`}>{`${confidence} · ${CONFIDENCE_LABEL[confidence]}`}</span>;
}
