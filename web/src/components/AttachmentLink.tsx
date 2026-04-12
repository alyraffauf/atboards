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
  return (
    <a
      href={`${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-neutral-500 hover:text-neutral-300 block mt-1"
    >
      [{name}]
    </a>
  );
}
