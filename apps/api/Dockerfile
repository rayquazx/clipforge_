# ---- Build stage ---------------------------------------------------------
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install OS-level dependencies required by some Python packages.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer caching optimisation).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code.
COPY . .

# Expose the default Uvicorn port.
EXPOSE 8000

# Start the ASGI server.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
