import { Paperclip } from "lucide-react";
import { blobUrl } from "../../lib/atproto";

interface AttachmentLinkProps {
  pds: string;
  did: string;
  cid: string;
  name: string;
}

export default function AttachmentLink({
  pds,
  did,
  cid,
  name,
}: AttachmentLinkProps) {
  const url = blobUrl(pds, did, cid);

  async function download(e: React.MouseEvent) {
    e.preventDefault();
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <a
      href={url}
      onClick={download}
      className="text-xs text-neutral-400 hover:text-neutral-300 inline-flex items-center gap-1 mt-3 cursor-pointer"
    >
      <Paperclip size={11} /> {name}
    </a>
  );
}
