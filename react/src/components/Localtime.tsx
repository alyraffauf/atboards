import { formatFullDate, relativeDate } from "../lib/util";

export default function Localtime({ iso }: { iso: string }) {
  if (!iso) return null;
  return (
    <time className="text-xs text-neutral-500" title={formatFullDate(iso)}>
      {relativeDate(iso)}
    </time>
  );
}
