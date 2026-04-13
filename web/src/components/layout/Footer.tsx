const linkStyle = "text-neutral-500 hover:text-neutral-300";

const links = [
  { href: "https://github.com/alyraffauf/atbbs", label: "github" },
  { href: "https://ko-fi.com/alyraffauf", label: "ko-fi" },
];

export default function Footer() {
  return (
    <footer className="border-t border-neutral-800 mt-auto">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-neutral-500">
        <span>
          made by <a href="https://aly.codes" className={linkStyle}>aly.codes</a>
        </span>
        <div className="flex items-center gap-4">
          {links.map(({ href, label }) => (
            <a key={label} href={href} className={linkStyle}>{label}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}
