/** Small React wrappers for the Steward controls (classes in src/styles/steward.css). */

/** A setting row: words on the left, the control on the right. */
export function Option({ title, hint, children, bold = true }: { title: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; bold?: boolean }) {
  return (
    <div className="st-option">
      <span>
        {bold ? <b>{title}</b> : title}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  );
}

/** On/off switch (role="switch"). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="st-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Pick one of 2–4 choices. */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="st-seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}
