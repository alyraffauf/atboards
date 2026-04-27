interface FileChipsProps {
  files: File[];
  onRemove: (index: number) => void;
  onInsert?: (file: File) => void;
}

export default function FileChips({
  files,
  onRemove,
  onInsert,
}: FileChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
      {files.map((file, i) => (
        <span
          key={i}
          className={`flex items-center gap-1 bg-neutral-800 px-2 py-1 rounded ${
            onInsert ? "hover:bg-neutral-700 cursor-pointer" : ""
          }`}
          onClick={onInsert ? () => onInsert(file) : undefined}
          title={onInsert ? "click to embed in body" : undefined}
        >
          {file.name}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(i);
            }}
            aria-label={`Remove ${file.name}`}
            className="text-neutral-400 hover:text-red-400"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
