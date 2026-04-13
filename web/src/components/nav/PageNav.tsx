/** Windowed page-number bar for thread reply pagination. */

const WINDOW = 2;

interface PageNavProps {
  current: number;
  total: number;
  onGo: (page: number) => void;
}

interface Slot {
  key: string;
  label: string;
  page: number | null;
  active?: boolean;
}

function buildSlots(current: number, total: number): Slot[] {
  let start = Math.max(1, current - WINDOW);
  let end = Math.min(total, current + WINDOW);
  if (end - start < 4) {
    if (start === 1) end = Math.min(total, start + 4);
    else if (end === total) start = Math.max(1, end - 4);
  }

  const slots: Slot[] = [];
  if (current > 1) slots.push({ key: "prev", label: "←", page: current - 1 });
  if (start > 1) {
    slots.push({ key: "first", label: "1", page: 1 });
    if (start > 2) slots.push({ key: "gap-left", label: "...", page: null });
  }
  for (let i = start; i <= end; i++) {
    slots.push({
      key: `p${i}`,
      label: String(i),
      page: i,
      active: i === current,
    });
  }
  if (end < total) {
    if (end < total - 1)
      slots.push({ key: "gap-right", label: "...", page: null });
    slots.push({ key: "last", label: String(total), page: total });
  }
  if (current < total)
    slots.push({ key: "next", label: "→", page: current + 1 });
  return slots;
}

export default function PageNav({ current, total, onGo }: PageNavProps) {
  const slots = buildSlots(current, total);
  return (
    <div className="flex items-center justify-center gap-2 text-sm w-full">
      {slots.map((slot) => {
        if (slot.active)
          return (
            <span
              key={slot.key}
              className="text-neutral-200 bg-neutral-800 rounded px-3 py-1"
            >
              {slot.label}
            </span>
          );
        if (slot.page !== null)
          return (
            <button
              key={slot.key}
              onClick={() => onGo(slot.page!)}
              className="text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded px-3 py-1"
            >
              {slot.label}
            </button>
          );
        return (
          <span key={slot.key} className="text-neutral-600 px-2 py-1">
            {slot.label}
          </span>
        );
      })}
    </div>
  );
}
