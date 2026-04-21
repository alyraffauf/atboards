import { useMemo, useState } from "react";
import { Phone, Copy, Check } from "lucide-react";
import { useDiscovery } from "../hooks/useDiscovery";
import { usePageTitle } from "../hooks/usePageTitle";
import DialBBS, { type Suggestion } from "../components/DialBBS";
import DiscoveryList from "../components/DiscoveryList";

export default function LoggedOutHome() {
  const discovered = useDiscovery();
  const suggestions = useMemo<Suggestion[]>(
    () =>
      discovered.map((entry) => ({
        to: `/bbs/${entry.handle}`,
        name: entry.name,
        handle: entry.handle,
      })),
    [discovered],
  );
  const [tab, setTab] = useState<"brew" | "uv" | "telnet">("brew");
  const [copied, setCopied] = useState(false);
  usePageTitle("atbbs");

  const installCommands: Record<string, string> = {
    brew: "brew install alyraffauf/tap/atbbs\natbbs",
    uv: "uv tool install atbbs\natbbs",
    telnet: "telnet tel.atbbs.xyz",
  };

  function handleCopy() {
    navigator.clipboard.writeText(installCommands[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const activeTab = "py-2 border-b-2 text-neutral-200 border-neutral-200";
  const inactiveTab =
    "py-2 border-b-2 text-neutral-400 hover:text-neutral-300 border-transparent";

  return (
    <div className="h-full flex flex-col justify-center">
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
            AT Protocol
          </a>
          .
        </h1>
        <p className="text-neutral-400 max-w-md mx-auto">
          Build a community from your existing account. Tightly curated, fully
          portable, open by design.
        </p>
      </div>

      <div className="border-t border-neutral-800 py-4">
        <h2 className="text-neutral-300 mb-4 flex items-center gap-2">
          <Phone size={16} /> Dial a BBS
        </h2>
        <div className="mb-6">
          <DialBBS discovered={discovered} suggestions={suggestions} />
        </div>
        <DiscoveryList discovered={discovered} />
      </div>

      <div className="border-t border-neutral-800 py-4">
        <h2 className="text-neutral-300 mb-4">Better yet, use your terminal</h2>
        <div className="flex gap-4 border-b border-neutral-800 mb-4">
          {(["brew", "uv", "telnet"] as const).map((installer) => (
            <button
              key={installer}
              onClick={() => setTab(installer)}
              className={tab === installer ? activeTab : inactiveTab}
            >
              {installer}
            </button>
          ))}
        </div>
        <div className="relative">
          <pre className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 pr-12 text-neutral-400 text-xs">
            {installCommands[tab].split("\n").map((line, i) => (
              <span key={`${tab}-${i}`}>
                {i > 0 && "\n"}
                <span className="select-none">$ </span>
                {line}
              </span>
            ))}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2.5 right-2.5 text-neutral-500 hover:text-neutral-300"
            aria-label="Copy to clipboard"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
