import { useRef, type SyntheticEvent } from "react";
import { Send, Paperclip } from "lucide-react";
import { Input, Textarea, Button } from "./Form";
import FileChips from "./FileChips";
import { MAX_ATTACHMENTS } from "../../lib/limits";

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
  files: File[];
  onFilesChange: (files: File[]) => void;
  replyingTo?: { uri: string; handle: string } | null;
  onClearReplyTo?: () => void;
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
  replyingTo,
  onClearReplyTo,
  bodyMaxLength,
  titleMaxLength,
  submitLabel = "post",
  posting = false,
  className = "",
}: ComposeFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertSnippet(snippet: string) {
    const textarea = textareaRef.current;
    const isFocused = !!textarea && document.activeElement === textarea;
    if (!textarea || !isFocused) {
      const sep = body.length > 0 && !body.endsWith("\n") ? "\n" : "";
      onBodyChange(body + sep + snippet);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = body.slice(0, start) + snippet + body.slice(end);
    onBodyChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + snippet.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const combined = [...files, ...Array.from(fileList)].slice(
      0,
      MAX_ATTACHMENTS,
    );
    onFilesChange(combined);
  }

  const attachmentsAtLimit = files.length >= MAX_ATTACHMENTS;

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  function insertAttachment(file: File) {
    const encoded = encodeURIComponent(file.name);
    const snippet = file.type.startsWith("image/")
      ? `![${file.name}](attachment:${encoded})`
      : `[${file.name}](attachment:${encoded})`;
    insertSnippet(snippet);
  }

  return (
    <form onSubmit={onSubmit} className={`space-y-3 ${className}`}>
      {replyingTo && onClearReplyTo && (
        <div className="text-xs text-neutral-400">
          <span>replying to {replyingTo.handle}</span>
          <button
            type="button"
            onClick={onClearReplyTo}
            aria-label="Clear reply"
            className="text-neutral-400 hover:text-red-400 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {onTitleChange !== undefined && (
        <Input
          name="title"
          value={title ?? ""}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          required
          maxLength={titleMaxLength}
        />
      )}

      <Textarea
        ref={textareaRef}
        name="body"
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

      {files.length > 0 && (
        <FileChips
          files={files}
          onRemove={removeFile}
          onInsert={insertAttachment}
        />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={posting}>
          {posting ? (
            "posting..."
          ) : (
            <>
              <Send size={14} className="inline -mt-0.5" /> {submitLabel}
            </>
          )}
        </Button>
        {!attachmentsAtLimit && !posting && (
          <label className="text-neutral-200 cursor-pointer bg-neutral-800 hover:bg-neutral-700 px-4 py-2 rounded inline-block">
            <span className="inline-flex items-center gap-1.5">
              <Paperclip size={14} /> attach
            </span>
            <input
              name="attachments"
              type="file"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
          </label>
        )}
      </div>
    </form>
  );
}
