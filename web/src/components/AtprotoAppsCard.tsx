import { ExternalLink } from "lucide-react";
import type { AtprotoApp } from "../lib/atprotoApps";

interface AtprotoAppsCardProps {
  apps: AtprotoApp[];
}

export default function AtprotoAppsCard({ apps }: AtprotoAppsCardProps) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded p-4">
      <p className="text-xs text-neutral-500 mb-2">
        The same account works for apps like:
      </p>
      <ul className="space-y-2 text-sm">
        {apps.map((app) => (
          <li
            key={app.name}
            className="flex items-center gap-2 text-neutral-300"
          >
            <span className="text-neutral-600">•</span>
            <span>{app.name}</span>
            <a
              href={app.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${app.name}`}
              className="text-neutral-500 hover:text-neutral-300"
            >
              <ExternalLink size={12} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
