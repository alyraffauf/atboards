import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link to="/" className="shrink-0 hover:opacity-80">
      <picture>
        <source srcSet="/hero-dark.svg" media="(prefers-color-scheme: dark)" />
        <img
          src="/hero.svg"
          alt="@bbs"
          style={{ height: "1.25rem", imageRendering: "pixelated" }}
          className="inline-block"
        />
      </picture>
    </Link>
  );
}
