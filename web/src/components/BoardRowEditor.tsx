import { Input } from "./Form";

export interface BoardRow {
  slug: string;
  name: string;
  desc: string;
}

interface BoardRowEditorProps {
  boards: BoardRow[];
  onChange: (boards: BoardRow[]) => void;
}

export default function BoardRowEditor({
  boards,
  onChange,
}: BoardRowEditorProps) {
  function updateField(
    index: number,
    field: keyof BoardRow,
    value: string,
  ) {
    const next = boards.map((b, i) =>
      i === index ? { ...b, [field]: value } : b,
    );
    onChange(next);
  }

  return (
    <div>
      <label className="block text-neutral-400 mb-1">Boards</label>
      <p className="text-neutral-500 text-xs mb-2">
        One board per row: slug, name, description
      </p>
      <div className="space-y-2">
        {boards.map((board, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={board.slug}
              onChange={(e) => updateField(i, "slug", e.target.value)}
              placeholder="slug"
              className="w-1/4!"
            />
            <Input
              value={board.name}
              onChange={(e) => updateField(i, "name", e.target.value)}
              placeholder="Name"
              className="w-1/3!"
            />
            <Input
              value={board.desc}
              onChange={(e) => updateField(i, "desc", e.target.value)}
              placeholder="Description"
              className="flex-1!"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...boards, { slug: "", name: "", desc: "" }])}
        className="mt-2 text-neutral-500 hover:text-neutral-300 text-xs"
      >
        + add board
      </button>
    </div>
  );
}
