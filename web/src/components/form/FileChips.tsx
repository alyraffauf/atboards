interface FileChipsProps {
  files: File[];
  onRemove: (index: number) => void;
}

export default function FileChips({ files, onRemove }: FileChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
      {files.map((file, i) => (
        <span
          key={i}
          className="flex items-center gap-1 bg-neutral-800 px-2 py-1 rounded"
        >
          {file.name}
          <button
            type="button"
            onClick={() => onRemove(i)}
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
