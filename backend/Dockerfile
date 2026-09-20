# Used by Railway via RAILWAY_DOCKERFILE_PATH=backend/Dockerfile with the
# repo root as build context (GitHub autodeploy from the modernist branch).
# The managed railpack/nixpacks builders were failing at prepare on Metal
# builders, so we build with a plain Dockerfile instead.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev bash \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

CMD ["bash", "start.sh"]
