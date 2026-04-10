import { useEffect, useState, type InputHTMLAttributes } from "react";

const PLACEHOLDERS = [
  "handle.blacksky.app",
  "handle.bsky.social",
  "handle.eurosky.social",
  "handle.northsky.social",
  "handle.selfhosted.social",
  "handle.tngl.sh",
  "handle.pds.witchcraft.systems",
  "handle.your-domain.com",
];

// Props for HandleInput. Extends standard <input> props so callers can
// pass things like `required`, `disabled`, `id`, etc.
interface HandleInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (v: string) => void;
}

export default function HandleInput({
  value,
  onChange,
  className = "",
  ...rest // any extra <input> attributes (required, disabled, etc.)
}: HandleInputProps) {
  // Cycle through placeholder examples every 3 seconds.
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3000);

    // Stop the timer when this component is removed from the page.
    return () => clearInterval(timer);
  }, []);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={PLACEHOLDERS[index]}
      className={`bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 ${className}`}
      {...rest}
    />
  );
}
