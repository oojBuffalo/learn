import { useId } from "react";
import type { NoteTarget } from "@study/shared";

export type TargetPackage = { id: string; title: string; lessons: { id: string; title: string }[] };
export const encodeTarget = (t: NoteTarget | null): string => t === null ? "" : `${t.packageId}/${t.lessonId ?? ""}`;
export function decodeTarget(v: string): NoteTarget | null {
  const slash = v.indexOf("/");
  return slash < 0 ? null : { packageId: v.slice(0, slash), lessonId: v.slice(slash + 1) || null };
}
export default function TargetSelect({ label, packages, value, onChange, lessonsOnly = false, currentOnly = false, disabled = false }: {
  label: string; packages: TargetPackage[]; value: NoteTarget | null; onChange: (t: NoteTarget | null) => void;
  lessonsOnly?: boolean; currentOnly?: boolean; disabled?: boolean;
}) {
  const id = useId();
  const encoded = encodeTarget(value);
  const targets = new Set(packages.flatMap((p) => [
    ...(!lessonsOnly && (!currentOnly || p.lessons.length === 0) ? [`${p.id}/`] : []),
    ...p.lessons.map((l) => `${p.id}/${l.id}`),
  ]));
  return <div>
    <label htmlFor={id}>{label}</label>
    <select className="field" id={id} value={encoded} disabled={disabled} onChange={(event) => onChange(decodeTarget(event.target.value))}>
      {lessonsOnly ? <option value="" disabled>Pick a lesson…</option> : <option value="">Standalone</option>}
      {currentOnly ? packages.flatMap((p) => p.lessons.length
        ? p.lessons.map((l) => <option key={`${p.id}/${l.id}`} value={`${p.id}/${l.id}`}>{`${p.title} › ${l.title}`}</option>)
        : [<option key={`${p.id}/`} value={`${p.id}/`}>{p.title}</option>])
        : packages.map((p) => <optgroup key={p.id} label={p.title}>
          {!lessonsOnly && <option value={`${p.id}/`}>Whole package</option>}
          {p.lessons.map((l) => <option key={l.id} value={`${p.id}/${l.id}`}>{l.title}</option>)}
        </optgroup>)}
      {value && !targets.has(encoded) && <option value={encoded}>{`${value.packageId}${value.lessonId === null ? "" : `/${value.lessonId}`} (no longer in your library)`}</option>}
    </select>
  </div>;
}
