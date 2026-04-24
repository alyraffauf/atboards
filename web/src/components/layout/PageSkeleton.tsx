export default function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden>
      <div className="h-6 w-2/3 bg-neutral-800 rounded" />
      <div className="h-4 w-full bg-neutral-900 rounded" />
      <div className="h-4 w-5/6 bg-neutral-900 rounded" />
      <div className="space-y-2 pt-4">
        <div className="h-16 w-full bg-neutral-900 rounded" />
        <div className="h-16 w-full bg-neutral-900 rounded" />
        <div className="h-16 w-full bg-neutral-900 rounded" />
      </div>
    </div>
  );
}
