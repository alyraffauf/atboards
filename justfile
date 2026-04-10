default: dev

dev:
    cd web && npm run dev

tui:
    uv run python -m tui

fmt:
    uv format
    cd web && npx --yes prettier --write src/

lex:
    cd web && npm run lex

build:
    cd web && VITE_PUBLIC_URL=${PUBLIC_URL:-} npm run build

docker:
    docker build -t atbbs .

up:
    docker compose up -d

down:
    docker compose down

logs:
    docker compose logs -f

# Set version in pyproject.toml
version ver:
    uv run python -c "import re, pathlib; p=pathlib.Path('pyproject.toml'); p.write_text(re.sub(r'^version = \".*\"', 'version = \"{{ ver }}\"', p.read_text(), count=1, flags=re.M))"
    uv lock

# Tag and push a release
release ver: (version ver)
    git add -A
    git commit -m "v{{ ver }}"
    git tag "v{{ ver }}"
    git push
    git push --tags
