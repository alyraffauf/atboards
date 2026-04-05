default: dev

dev:
    #!/bin/sh
    trap 'kill 0' EXIT
    ./tailwindcss -i web/static/input.css -o web/static/style.css --watch &
    QUART_DEBUG=1 uv run quart --app main:app run --reload &
    wait

css:
    ./tailwindcss -i web/static/input.css -o web/static/style.css --minify

tui:
    uv run python -m tui

build:
    docker build -t atbbs .

up:
    docker compose up -d

down:
    docker compose down

logs:
    docker compose logs -f

# Set version in pyproject.toml
version ver:
    python -c "import re, pathlib; p=pathlib.Path('pyproject.toml'); p.write_text(re.sub(r'^version = \".*\"', 'version = \"{{ ver }}\"', p.read_text(), count=1, flags=re.M))"
    uv lock

# Tag and push a release
release ver: (version ver) css
    git add -A
    git commit -m "v{{ ver }}"
    git tag "v{{ ver }}"
    git push
    git push --tags
