# Used by Railway via RAILWAY_DOCKERFILE_PATH=backend/Dockerfile. The service
# root directory is /backend, so the build CONTEXT is backend/ — all COPY
# paths below are relative to backend/, not the repo root.
# The managed railpack/nixpacks builders were failing at prepare on Metal
# builders, so we build with a plain Dockerfile instead.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev bash \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Model for the swimmer-portrait cut-out, baked into the image (own layer, so
# it is only fetched again when core/cutout.py changes)
ENV CUTOUT_MODEL=/opt/models/isnet-general-use.onnx
COPY core/cutout.py /tmp/cutout.py
RUN python /tmp/cutout.py fetch

COPY . .

CMD ["bash", "start.sh"]
