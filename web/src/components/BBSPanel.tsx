import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { ActionLink } from "./nav/ActionButton";
import { getAvatar } from "../lib/atproto";

interface BBSPanelProps {
  hasBBS: boolean;
  userHandle: string;
  userDid: string;
  bbsName: string | null;
  onDelete: () => void;
}

export default function BBSPanel({
  hasBBS,
  userHandle,
  userDid,
  bbsName,
  onDelete,
}: BBSPanelProps) {
  const [avatar, setAvatar] = useState<string>();

  useEffect(() => {
    if (!hasBBS) return;
    getAvatar(userDid).then(setAvatar);
  }, [hasBBS, userDid]);

  if (!hasBBS) {
    return (
      <>
        <p className="text-neutral-400 mb-4">No community yet.</p>
        <ActionLink to="/account/create" icon={Plus}>
          create a community
        </ActionLink>
      </>
    );
  }

  return (
    <>
      <Link
        to={`/bbs/${encodeURIComponent(userHandle)}`}
        className="group flex items-center justify-between py-3 border-b border-neutral-800"
      >
        <div className="flex items-center gap-3 min-w-0 text-neutral-300 group-hover:text-neutral-200">
          {avatar && (
            <img
              src={avatar}
              alt=""
              className="w-6 h-6 rounded-full shrink-0"
            />
          )}
          <span className="truncate">{bbsName ?? `@${userHandle}`}</span>
        </div>
        <span className="flex items-center gap-1 text-sm text-neutral-400 group-hover:text-neutral-300">
          view <ArrowRight size={12} />
        </span>
      </Link>

      <SettingsRow
        to="/account/edit"
        icon={Pencil}
        label="Edit"
        hint="Update name, boards, and intro."
      />
      <SettingsRow
        to="/account/moderate"
        icon={Shield}
        label="Moderate"
        hint="Ban users and hide posts."
      />

      <p className="text-xs text-neutral-500 uppercase tracking-wide mt-8 mb-2">
        Danger zone
      </p>
      <button
        type="button"
        onClick={onDelete}
        className="group w-full flex items-center justify-between py-3 text-left border-t border-red-400/30"
      >
        <div className="flex items-center gap-3">
          <Trash2
            size={16}
            className="text-red-400 group-hover:text-red-500"
          />
          <div>
            <div className="text-red-400 group-hover:text-red-500">Delete</div>
            <div className="text-xs text-neutral-400">
              Remove your community.
            </div>
          </div>
        </div>
        <ArrowRight
          size={12}
          className="text-neutral-500 group-hover:text-neutral-300"
        />
      </button>
    </>
  );
}

interface SettingsRowProps {
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}

function SettingsRow({ to, icon: Icon, label, hint }: SettingsRowProps) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between py-3 border-b border-neutral-800"
    >
      <div className="flex items-center gap-3">
        <Icon
          size={16}
          className="text-neutral-400 group-hover:text-neutral-200"
        />
        <div>
          <div className="text-neutral-300 group-hover:text-neutral-200">
            {label}
          </div>
          <div className="text-xs text-neutral-400">{hint}</div>
        </div>
      </div>
      <ArrowRight
        size={12}
        className="text-neutral-500 group-hover:text-neutral-300"
      />
    </Link>
  );
}
