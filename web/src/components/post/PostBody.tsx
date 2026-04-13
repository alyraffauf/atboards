import Markdown from "react-markdown";

export default function PostBody({ children }: { children: string }) {
  return (
    <div className="text-neutral-400 leading-relaxed prose dark:prose-invert prose-sm prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm">
      <Markdown>{children}</Markdown>
    </div>
  );
}
