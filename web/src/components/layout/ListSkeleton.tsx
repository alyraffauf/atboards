export default function ListSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden>
      <div className="h-16 w-full bg-neutral-900 rounded" />
      <div className="h-16 w-full bg-neutral-900 rounded" />
      <div className="h-16 w-full bg-neutral-900 rounded" />
    </div>
  );
}
