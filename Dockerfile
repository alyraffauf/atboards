FROM python:3.14-slim

WORKDIR /app

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Tailwind CSS standalone CLI
ADD https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-linux-x64 /usr/local/bin/tailwindcss
RUN chmod +x /usr/local/bin/tailwindcss

# Copy dependency files first (layer caching)
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application code
COPY main.py ./
COPY core/ core/
COPY web/ web/
COPY lexicons/ lexicons/

# Build Tailwind CSS
RUN tailwindcss -i web/static/input.css -o web/static/style.css --minify

# Create data directory for secrets and database
RUN mkdir -p /data

ENV ATBOARDS_DATA_DIR=/data
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uv", "run", "hypercorn", "main:app", "--bind", "0.0.0.0:8000", "--workers", "3"]
