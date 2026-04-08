import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { resolveIdentitiesBatch } from "../lib/atproto";
import { SITE } from "../lib/lexicon";
import { useTitle } from "../lib/util";

interface UFORecord {
  did: string;
  record: { name?: string; description?: string };
}

interface Discovered {
  handle: string;
  name: string;
  desc: string;
}

export default function Home() {
  const nav = useNavigate();
  const [handle, setHandle] = useState("");
  const [tab, setTab] = useState<"pip" | "uv" | "brew">("pip");
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  useTitle("atbbs");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const h = handle.trim();
    if (h) nav(`/bbs/${encodeURIComponent(h)}`);
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `https://ufos-api.microcosm.blue/records?collection=${SITE}&limit=50`,
        );
        let records = (await r.json()) as UFORecord[];
        if (!records.length) return;
        if (records.length > 5) {
          records = records.sort(() => Math.random() - 0.5).slice(0, 5);
        }
        const authors = await resolveIdentitiesBatch(records.map((r) => r.did));
        const items: Discovered[] = [];
        for (const r of records) {
          if (!(r.did in authors)) continue;
          items.push({
            handle: authors[r.did].handle,
            name: r.record.name || authors[r.did].handle,
            desc: r.record.description || "",
          });
        }
        setDiscovered(items);
      } catch {
        // optional
      }
    })();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="py-16 text-center">
        <img
          src="/hero.svg"
          alt="@bbs"
          className="mx-auto mb-4"
          style={{ width: 276, imageRendering: "pixelated" }}
        />
        <h1 className="text-lg text-neutral-400 mb-3">
          Bulletin boards on the Atmosphere.
        </h1>
        <p className="text-neutral-500 max-w-md mx-auto">
          Run a BBS from your own account. No server required. Users own their
          posts, communities migrate freely. Built on{" "}
          <a
            href="https://atproto.com"
            className="text-neutral-400 hover:text-neutral-300 underline underline-offset-2"
          >
            atproto
          </a>
          .
        </p>
      </div>

      <div className="border-t border-neutral-800 py-8">
        <h2 className="text-neutral-300 mb-4">Dial a BBS</h2>
        <form onSubmit={onSubmit} className="flex gap-2 mb-6">
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle.example.com"
            required
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
          <button
            type="submit"
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
          >
            go
          </button>
        </form>
        {discovered.length > 0 && (
          <div>
            <p className="text-neutral-500 text-xs uppercase tracking-wide mb-3">
              or try one of these
            </p>
            <div className="space-y-1">
              {discovered.map((d) => (
                <a
                  key={d.handle}
                  href={`/bbs/${encodeURIComponent(d.handle)}`}
                  className="flex items-baseline gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-900 group"
                >
                  <span className="text-neutral-200 group-hover:text-white">
                    {d.name}
                  </span>
                  <span className="text-neutral-500">{d.desc}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-800 py-8">
        <h2 className="text-neutral-300 mb-4">Better yet, use your terminal</h2>
        <div className="flex gap-4 border-b border-neutral-800 mb-4">
          {(["pip", "uv", "brew"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 border-b-2 ${tab === t ? "text-neutral-200 border-neutral-200" : "text-neutral-500 hover:text-neutral-300 border-transparent"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "pip" && (
          <pre className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-400 text-xs">
            <span className="text-neutral-500">$</span> pip install atbbs
            {"\n"}
            <span className="text-neutral-500">$</span> atbbs
          </pre>
        )}
        {tab === "uv" && (
          <pre className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-400 text-xs">
            <span className="text-neutral-500">$</span> uv tool install atbbs
            {"\n"}
            <span className="text-neutral-500">$</span> atbbs
          </pre>
        )}
        {tab === "brew" && (
          <pre className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-400 text-xs">
            <span className="text-neutral-500">$</span> brew install
            alyraffauf/tap/atbbs
            {"\n"}
            <span className="text-neutral-500">$</span> atbbs
          </pre>
        )}
      </div>
    </div>
  );
}
