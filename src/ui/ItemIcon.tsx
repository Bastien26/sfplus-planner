import { data, iconUrl } from "../data";

export function ItemIcon({ item, size = 24 }: { item: string; size?: number }) {
  const it = data.items[item];
  const src = iconUrl(it?.icon);
  if (!src) return <span style={{ width: size, height: size }} className="inline-block shrink-0 rounded bg-panel-2" />;
  return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0" style={{ width: size, height: size }} />;
}

export function MachineIcon({ machine, size = 24 }: { machine: string; size?: number }) {
  const src = iconUrl(data.machines[machine]?.icon);
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0" style={{ width: size, height: size }} />;
}
