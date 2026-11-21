# ==========================================================================
# ClipForge Worker — Docker image
#
# Builds a slim Python image with ffmpeg and all worker dependencies,
# then starts a Celery worker with 2 concurrent processes.
# ==========================================================================

FROM python:3.11-slim

# Install system-level dependencies (ffmpeg for video processing, compilers & libraries for audio/db).
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg gcc g++ libpq-dev libsndfile1 pkg-config && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer cache optimisation).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source.
COPY . .

# Default entrypoint: run the Celery worker.
CMD ["celery", "-A", "app.celery_app", "worker", "--loglevel=info", "--concurrency=2"]
