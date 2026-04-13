import { useState } from "react";
import { useDiscovery } from "../hooks/useDiscovery";
import { usePageTitle } from "../hooks/usePageTitle";
import DialBBS from "../components/DialBBS";
import DiscoveryList from "../components/DiscoveryList";

export default function LoggedOutHome() {
  const discovered = useDiscovery();
  const [tab, setTab] = useState<"pip" | "uv" | "brew" | "telnet">("pip");
  usePageTitle("atbbs");

  const activeTab = "py-2 border-b-2 text-neutral-200 border-neutral-200";
  const inactiveTab =
    "py-2 border-b-2 text-neutral-500 hover:text-neutral-300 border-transparent";

  return (
    <div className="h-full flex flex-col justify-center overflow-hidden">
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
        <div className="mb-6">
          <DialBBS discovered={discovered} />
        </div>
        <DiscoveryList discovered={discovered} />
      </div>

      <div className="border-t border-neutral-800 py-4">
        <h2 className="text-neutral-300 mb-4">Better yet, use your terminal</h2>
        <div className="flex gap-4 border-b border-neutral-800 mb-4">
          {(["pip", "uv", "brew", "telnet"] as const).map((installer) => (
            <button
              key={installer}
              onClick={() => setTab(installer)}
              className={tab === installer ? activeTab : inactiveTab}
            >
              {installer}
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
