FROM python:3.13-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python \
    PORT=8080

WORKDIR /app

# Install minimal OS dependencies for network & health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Ensure empty uploads directory exists for fallback compatibility
RUN mkdir -p uploads

# Cloud Run injects $PORT (default 8080)
EXPOSE 8080

# Run Uvicorn with proxy headers enabled (CRITICAL for Cloud Run HTTPS & Session cookies)
CMD exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${PORT:-8080} \
    --proxy-headers \
    --forwarded-allow-ips="*"