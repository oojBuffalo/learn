import { useRef, useState } from "react";
import type { Explanation } from "@study/shared";
import { dismissExplanation } from "../api.js";
import { message } from "../text.js";

/**
 * Renders a revisit prompt's Dismiss button, which hides the prompt until a new low rating.
 * Args:
 *   explanation: The explanation raising the prompt. onDismissed: Receives it, no longer flagged revisit.
 * Returns:
 *   The button, and an alert when the dismissal fails.
 * Raises:
 *   None; a failed request is shown inline and can be retried.
 */
export default function DismissRevisit({ explanation, onDismissed }: {
  explanation: Explanation; onDismissed: (dismissed: Explanation) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function dismiss() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError(null);
    try { onDismissed(await dismissExplanation(explanation.id)); }
    catch (caught) { setError(`Couldn’t dismiss it (${message(caught)}).`); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <>
    <button className="link-btn" disabled={pending} onClick={() => void dismiss()}
      aria-label={`Dismiss revisit prompt for ${explanation.lessonTitle ?? explanation.lessonId}`}>Dismiss</button>
    {error && <p className="errors" role="alert">{error}</p>}
  </>;
}
