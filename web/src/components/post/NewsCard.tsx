import type { NewsPost } from "../../lib/bbs";
import AttachmentLink from "./AttachmentLink";
import PostActions from "./PostActions";
import PostBody, { unembeddedAttachments } from "./PostBody";
import PostMeta from "./PostMeta";

interface NewsCardProps {
  news: NewsPost;
  handle: string;
  pds: string;
  did: string;
  isSysop: boolean;
  onDelete: () => void;
}

export default function NewsCard({
  news,
  handle,
  pds,
  did,
  isSysop,
  onDelete,
}: NewsCardProps) {
  const remaining = unembeddedAttachments(news.attachments, news.body);

  return (
    <article className="bg-neutral-900 border border-neutral-800 rounded p-4">
      <div className="flex items-baseline justify-between mb-3">
        <PostMeta handle={handle} createdAt={news.createdAt} />
        <PostActions isAuthor={isSysop} isSysop={false} onDelete={onDelete} />
      </div>
      <h1 className="text-lg text-neutral-200 font-bold mb-3">{news.title}</h1>
      <PostBody attachments={news.attachments} pds={pds} did={did}>
        {news.body}
      </PostBody>
      {remaining.length > 0 && (
        <div className="mt-3 space-y-1">
          {remaining.map((attachment, index) => (
            <AttachmentLink
              key={index}
              pds={pds}
              did={did}
              cid={attachment.file.ref.$link}
              name={attachment.name}
            />
          ))}
        </div>
      )}
    </article>
  );
}
