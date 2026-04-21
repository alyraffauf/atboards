interface IdentityRowProps {
  avatar?: string;
  primary: string;
  secondary?: string;
}

export default function IdentityRow({
  avatar,
  primary,
  secondary,
}: IdentityRowProps) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {avatar && (
        <img src={avatar} alt="" className="w-6 h-6 rounded-full shrink-0" />
      )}
      <div className="min-w-0">
        <div className="text-sm text-neutral-200 truncate">{primary}</div>
        {secondary && (
          <div className="text-xs text-neutral-400 truncate">{secondary}</div>
        )}
      </div>
    </div>
  );
}
