import type { SyntheticEvent } from "react";
import { Input, Textarea, Button } from "./Form";

interface ComposeFormProps {
  onSubmit: (e: SyntheticEvent) => void;
  body: string;
  onBodyChange: (value: string) => void;
  bodyPlaceholder?: string;
  bodyRows?: number;
  bodyMaxLength?: number;
  title?: string;
  onTitleChange?: (value: string) => void;
  titlePlaceholder?: string;
  titleMaxLength?: number;
  files: FileList | null;
  onFilesChange: (files: FileList | null) => void;
  quote?: { uri: string; handle: string } | null;
  onClearQuote?: () => void;
  submitLabel?: string;
  posting?: boolean;
  className?: string;
}

export default function ComposeForm({
  onSubmit,
  body,
  onBodyChange,
  bodyPlaceholder = "What's on your mind?",
  bodyRows = 4,
  title,
  onTitleChange,
  titlePlaceholder = "Title",
  files,
  onFilesChange,
  quote,
  onClearQuote,
  submitLabel = "post",
  posting = false,
  className = "",
  bodyMaxLength,
  titleMaxLength,
}: ComposeFormProps) {
  const fileNames = files?.length
    ? Array.from(files)
        .map((f) => f.name)
        .join(", ")
    : "";

  return (
    <form onSubmit={onSubmit} className={`space-y-3 ${className}`}>
      {quote && onClearQuote && (
        <div className="text-xs text-neutral-500">
          <span>quoting {quote.handle}</span>
          <button
            type="button"
            onClick={onClearQuote}
            className="text-neutral-500 hover:text-red-400 ml-2"
          >
            x
          </button>
        </div>
      )}

      {onTitleChange !== undefined && (
        <Input
          value={title ?? ""}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          required
          maxLength={titleMaxLength}
        />
      )}

      <Textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={bodyPlaceholder}
        required
        rows={bodyRows}
        maxLength={bodyMaxLength}
      />

      <label className="text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer block">
        attach files
        <input
          type="file"
          multiple
          onChange={(e) => onFilesChange(e.target.files)}
          className="hidden"
        />
        {fileNames && (
          <span className="text-neutral-400 ml-2">{fileNames}</span>
        )}
      </label>

      <Button type="submit" disabled={posting}>
        {posting ? "posting..." : submitLabel}
      </Button>
    </form>
  );
}
