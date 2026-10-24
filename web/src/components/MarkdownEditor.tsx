import { useId, useState } from "react";
import { BODY_MAX } from "@study/shared";
import Markdown from "./Markdown.js";

export default function MarkdownEditor({ label, value, onChange, packageId, disabled = false, onSave }: {
  label: string; value: string; onChange: (value: string) => void; packageId?: string; disabled?: boolean; onSave?: () => void;
}) {
  const id = useId();
  const modeGroup = useId();
  const [preview, setPreview] = useState(false);
  return <div className="editor" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === "Enter" || event.key.toLowerCase() === "s")) {
      event.preventDefault(); onSave?.();
    }
  }}>
    <div className="editor-bar">
      <label htmlFor={id}>{label}</label>
      <div className="segmented" role="radiogroup" aria-label="Editor mode">
        <label><input type="radio" name={modeGroup} checked={!preview} onChange={() => setPreview(false)} />Write</label>
        <label><input type="radio" name={modeGroup} checked={preview} onChange={() => setPreview(true)} />Preview</label>
      </div>
    </div>
    <textarea id={id} className="field editor-text" spellCheck hidden={preview} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
    {preview && (value.trim() ? <Markdown packageId={packageId} className="prose editor-preview">{value}</Markdown>
      : <p className="editor-preview note">Nothing to preview yet.</p>)}
    <p className="note">Markdown and $math$ work — write {"\\$"} for a dollar sign.</p>
    {value.length > BODY_MAX * 0.9 && <p className="editor-count">{`${value.length.toLocaleString("en-US")} / ${BODY_MAX.toLocaleString("en-US")}`}</p>}
  </div>;
}
