import type { News } from "../lib/bbs";
import AttachmentLink from "./AttachmentLink";
import PostActions from "./PostActions";
import PostBody from "./PostBody";
import PostMeta from "./PostMeta";

interface NewsCardProps {
  news: News;
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
  return (
    <article className="bg-neutral-900 border border-neutral-800 rounded p-4">
      <div className="flex items-baseline justify-between mb-3">
        <PostMeta handle={handle} createdAt={news.createdAt} />
        <PostActions isAuthor={isSysop} isSysop={false} onDelete={onDelete} />
      </div>
      <h1 className="text-lg text-neutral-200 font-bold mb-3">{news.title}</h1>
      <PostBody>{news.body}</PostBody>
      {news.attachments && news.attachments.length > 0 && (
        <div className="mt-3 space-y-1">
          {news.attachments.map((attachment, index) => (
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
