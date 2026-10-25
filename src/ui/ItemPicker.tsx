import { useMemo, useRef, useState } from "react";
import { data, normalize } from "../data";
import type { Item } from "../data/types";
import { ItemIcon } from "./ItemIcon";

const MAX_RESULTS = 60;

export function ItemPicker({
  value,
  onChange,
  options,
  placeholder = "Choisir un objet…",
}: {
  value: string | null;
  onChange: (item: string) => void;
  options: Item[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    const list = q ? options.filter((i) => normalize(i.name).includes(q)) : options;
    if (q) list.sort((a, b) => Number(!normalize(a.name).startsWith(q)) - Number(!normalize(b.name).startsWith(q)));
    return list.slice(0, MAX_RESULTS);
  }, [options, query]);

  const choose = (item: Item) => {
    onChange(item.id);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const selected = value ? data.items[value] : null;
  return (
    <div className="relative min-w-0 flex-1">
      <div className="field flex items-center gap-2 py-1">
        {selected && !open && <ItemIcon item={selected.id} size={22} />}
        <input
          ref={inputRef}
          className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted"
          value={open ? query : (selected?.name ?? "")}
          placeholder={open && selected ? selected.name : placeholder}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
        />
      </div>
      {open && (
        <ul
          ref={listRef}
          className="absolute z-30 mt-1 max-h-80 w-full min-w-64 overflow-auto rounded-md border border-line bg-panel-2 py-1 shadow-xl"
          role="listbox"
        >
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">Aucun objet</li>}
          {matches.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${i === active ? "bg-accent/20 text-accent" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <ItemIcon item={item.id} size={22} />
              <span className="truncate">{item.name}</span>
              {item.form !== "solid" && <span className="ml-auto text-xs text-fluid">{item.form === "gas" ? "gaz" : "liquide"}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
