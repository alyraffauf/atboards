import Markdown, { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import AttachmentLink from "./AttachmentLink";
import { blobUrl, cdnImageUrl } from "../../lib/atproto";
import type { PostAttachment } from "../../lib/bbs";

interface PostBodyProps {
  children: string;
  attachments?: PostAttachment[];
  pds?: string;
  did?: string;
}

const ATTACHMENT_PREFIX = "attachment:";
const ATTACHMENT_NAME_RE = /attachment:([^\s)>"']+)/g;

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function MissingAttachment({ name }: { name: string }) {
  return (
    <span className="text-xs text-red-400">missing attachment: {name}</span>
  );
}

function ImageEmbed({
  imageUrl,
  linkUrl,
  alt,
}: {
  imageUrl: string;
  linkUrl: string;
  alt: string;
}) {
  return (
    <a href={linkUrl} target="_blank" rel="noreferrer">
      <img
        src={imageUrl}
        alt={alt}
        loading="lazy"
        className="max-w-full max-h-96 rounded"
      />
    </a>
  );
}

function findAttachment(
  url: string | undefined,
  attachments: PostAttachment[],
): { name: string; attachment: PostAttachment | undefined } | null {
  if (typeof url !== "string" || !url.startsWith(ATTACHMENT_PREFIX)) return null;
  const name = decodeName(url.slice(ATTACHMENT_PREFIX.length));
  return { name, attachment: attachments.find((a) => a.name === name) };
}

const passAttachmentUrls = (url: string) =>
  url.startsWith(ATTACHMENT_PREFIX) ? url : defaultUrlTransform(url);

function attachmentMarkdownComponents(
  attachments: PostAttachment[],
  pds: string,
  did: string,
): Components {
  return {
    img({ src, alt }) {
      const ref = findAttachment(src, attachments);
      if (!ref) return <img src={src} alt={alt} />;
      if (!ref.attachment) return <MissingAttachment name={ref.name} />;
      const cid = ref.attachment.file.ref.$link;
      return (
        <ImageEmbed
          imageUrl={cdnImageUrl(did, cid)}
          linkUrl={blobUrl(pds, did, cid)}
          alt={alt ?? ref.name}
        />
      );
    },
    a({ href, children, ...rest }) {
      const ref = findAttachment(href, attachments);
      if (!ref) {
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      }
      if (!ref.attachment) return <MissingAttachment name={ref.name} />;
      return (
        <AttachmentLink
          pds={pds}
          did={did}
          cid={ref.attachment.file.ref.$link}
          name={ref.attachment.name}
        />
      );
    },
  };
}

export default function PostBody({
  children,
  attachments,
  pds,
  did,
}: PostBodyProps) {
  const resolver =
    attachments && pds && did
      ? {
          urlTransform: passAttachmentUrls,
          components: attachmentMarkdownComponents(attachments, pds, did),
        }
      : {};

  return (
    <div className="text-neutral-400 leading-relaxed prose dark:prose-invert prose-sm prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm">
      <Markdown {...resolver}>{children}</Markdown>
    </div>
  );
}

function referencedAttachmentNames(body: string): Set<string> {
  return new Set(
    Array.from(body.matchAll(ATTACHMENT_NAME_RE), (match) =>
      decodeName(match[1]),
    ),
  );
}

export function unembeddedAttachments<T extends { name: string }>(
  attachments: T[] | undefined,
  body: string,
): T[] {
  if (!attachments?.length) return [];
  const embedded = referencedAttachmentNames(body);
  return attachments.filter((a) => !embedded.has(a.name));
}
