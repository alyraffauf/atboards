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
  async function download(e: React.MouseEvent) {
    e.preventDefault();
    try {
      const resp = await fetch(
        `${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`,
      );
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fall back to opening in a new tab
      window.open(
        `${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`,
        "_blank",
      );
    }
  }

  return (
    <a
      href={`${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`}
      onClick={download}
      className="text-xs text-neutral-500 hover:text-neutral-300 block mt-1 cursor-pointer"
    >
      [{name}]
    </a>
  );
}
