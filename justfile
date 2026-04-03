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
    docker build -t atboards .

up:
    docker compose up -d

down:
    docker compose down

logs:
    docker compose logs -f
