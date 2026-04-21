import { useState, type SyntheticEvent } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useHandleSearch } from "../../hooks/useHandleSearch";
import { useDropdown } from "../../hooks/useDropdown";
import HandleInput from "./HandleInput";
import HandleSuggestions from "./HandleSuggestions";
import { Button } from "./Form";

interface LoginFormProps {
  autoFocus?: boolean;
  idPrefix?: string;
}

export default function LoginForm({
  autoFocus,
  idPrefix = "login",
}: LoginFormProps) {
  const { login } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = useHandleSearch(handle);
  const dropdown = useDropdown(suggestions.length, (index) =>
    selectHandle(suggestions[index].handle),
  );
  const showSuggestions = dropdown.focused && suggestions.length > 0;

  function selectHandle(selected: string) {
    setHandle(selected);
    dropdown.close();
  }

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(handle.trim());
    } catch (err) {
      console.error("Login failed:", err);
      setError("Couldn't find that handle. Double-check the spelling?");
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div
        onFocus={dropdown.onFocus}
        onBlur={dropdown.onBlur}
        onKeyDown={dropdown.onKeyDown}
      >
        <form onSubmit={onSubmit} className="flex gap-2">
          <HandleInput
            name="handle"
            value={handle}
            onChange={setHandle}
            required
            autoFocus={autoFocus}
            className="flex-1"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-activedescendant={
              dropdown.activeIndex >= 0
                ? `${idPrefix}-option-${dropdown.activeIndex}`
                : undefined
            }
            aria-label="Enter your handle"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "..." : <LogIn size={16} />}
          </Button>
        </form>
        {showSuggestions && (
          <HandleSuggestions
            suggestions={suggestions}
            activeIndex={dropdown.activeIndex}
            onSelect={selectHandle}
            idPrefix={idPrefix}
          />
        )}
      </div>
    </>
  );
}
