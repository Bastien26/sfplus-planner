import { useEffect, useState } from "react";
import { fmt, parseNumber } from "../format";

/** Text input for decimals that accepts "7,5" and keeps partial typing like "7,". */
export function NumberField({
  value,
  onChange,
  placeholder,
  className = "w-20",
  title,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  className?: string;
  title?: string;
}) {
  const show = (v: number | null) => (v === null ? "" : fmt(v, 4).replace(/\s/g, ""));
  const [text, setText] = useState(show(value));

  useEffect(() => {
    if (parseNumber(text) !== value) setText(show(value));
  }, [value]);

  return (
    <input
      className={`field text-right tabular-nums ${className}`}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (n === null || n >= 0) onChange(n);
      }}
      onBlur={() => setText(show(value))}
    />
  );
}
