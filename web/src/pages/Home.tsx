import { useEffect, useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import HandleInput from "../components/form/HandleInput";
import ListLink from "../components/nav/ListLink";
import { resolveIdentitiesBatch } from "../lib/atproto";
import { SITE } from "../lib/lexicon";
import { usePageTitle } from "../hooks/usePageTitle";

interface UFORecord {
  did: string;
  record: { name?: string; description?: string };
}

interface Discovered {
  handle: string;
  name: string;
  desc: string;
}

let discoveryCache: { items: Discovered[]; expires: number } | null = null;
const DISCOVERY_TTL = 5 * 60 * 1000; // 5 minutes

export default function Home() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [tab, setTab] = useState<"pip" | "uv" | "brew" | "telnet">("pip");
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  usePageTitle("atbbs");

  function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    const trimmed = handle.trim();
    if (trimmed) navigate(`/bbs/${encodeURIComponent(trimmed)}`);
  }

  function onRandom() {
    if (!discovered.length) return;
    const pick = discovered[Math.floor(Math.random() * discovered.length)];
    navigate(`/bbs/${encodeURIComponent(pick.handle)}`);
  }

  useEffect(() => {
    if (discoveryCache && discoveryCache.expires > Date.now()) {
      setDiscovered(discoveryCache.items);
      return;
    }
    (async () => {
      try {
        const r = await fetch(
          `https://ufos-api.microcosm.blue/records?collection=${SITE}&limit=50`,
        );
        let records = (await r.json()) as UFORecord[];
        if (!records.length) return;
        records = records.sort(() => Math.random() - 0.5);
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
        discoveryCache = { items, expires: Date.now() + DISCOVERY_TTL };
        setDiscovered(items);
      } catch {}
    })();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 h-full flex flex-col justify-center overflow-hidden">
      <div className="text-center pb-4">
        <picture>
          <source
            srcSet="/hero-dark.svg"
            media="(prefers-color-scheme: dark)"
          />
          <img
            src="/hero.svg"
            alt="@bbs"
            className="mx-auto mb-4"
            style={{ width: 276, imageRendering: "pixelated" }}
          />
        </picture>
        <h1 className="text-lg text-neutral-400 mb-3">
          Bulletin boards on the{" "}
          <a
            href="https://atproto.com"
            className="text-neutral-400 hover:text-neutral-300 underline underline-offset-2"
          >
            Atmosphere
          </a>
          .
        </h1>
        <p className="text-neutral-500 max-w-md mx-auto">
          Build a community from your existing account. Tightly curated, fully
          portable, open by design.
        </p>
      </div>

      <div className="border-t border-neutral-800 py-4">
        <h2 className="text-neutral-300 mb-4">Dial a BBS</h2>
        <form
          onSubmit={onSubmit}
          className="flex flex-col sm:flex-row gap-2 mb-6"
        >
          <HandleInput
            name="handle"
            value={handle}
            onChange={setHandle}
            required
            className="sm:flex-1"
          />
          <button
            type="submit"
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
          >
            go
          </button>
          <button
            type="button"
            onClick={onRandom}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
          >
            random
          </button>
        </form>
        {discovered.length > 0 && (
          <div>
            <p className="text-neutral-500 text-xs uppercase tracking-wide mb-3">
              or try one of these
            </p>
            <div className="space-y-1">
              {discovered.slice(0, 5).map((bbs) => (
                <ListLink
                  key={bbs.handle}
                  to={`/bbs/${encodeURIComponent(bbs.handle)}`}
                  name={bbs.name}
                  description={bbs.desc}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-800 py-4">
        <h2 className="text-neutral-300 mb-4">Better yet, use your terminal</h2>
        <div className="flex gap-4 border-b border-neutral-800 mb-4">
          {(["pip", "uv", "brew", "telnet"] as const).map((t) => (
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
            <span className="text-neutral-500 select-none">$ </span>pip install
            atbbs
            {"\n"}
            <span className="text-neutral-500 select-none">$ </span>atbbs
          </pre>
        )}
        {tab === "uv" && (
          <pre className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-400 text-xs">
            <span className="text-neutral-500 select-none">$ </span>uv tool
            install atbbs
            {"\n"}
            <span className="text-neutral-500 select-none">$ </span>atbbs
          </pre>
        )}
        {tab === "brew" && (
          <pre className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-400 text-xs">
            <span className="text-neutral-500 select-none">$ </span>brew install
            alyraffauf/tap/atbbs
            {"\n"}
            <span className="text-neutral-500 select-none">$ </span>atbbs
          </pre>
        )}
        {tab === "telnet" && (
          <pre className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-400 text-xs">
            <span className="text-neutral-500 select-none">$ </span>telnet
            tel.atbbs.xyz
          </pre>
        )}
      </div>
    </div>
  );
}
