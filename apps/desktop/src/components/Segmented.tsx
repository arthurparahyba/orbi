/** A small radio group drawn as joined buttons. */
export function Segmented<T extends string>(props: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange(v: T): void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={props.value === o.value} className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
