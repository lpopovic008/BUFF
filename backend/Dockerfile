# Build from the REPO ROOT, not from inside backend/:
#   docker build -f backend/Dockerfile -t buff-api .
#
# Docker's "build context" is whichever directory you point it at — a
# COPY instruction can only reach files inside that context. This image
# needs both backend/ (the app) and src/data/ (the only data it has), so
# the context has to be the repo root, one level up from this file.

FROM python:3.11-slim

# Unbuffered stdout so `docker logs` shows output immediately instead of
# waiting on Python's internal buffering, and skip writing .pyc files —
# no benefit in an image that gets rebuilt from scratch every deploy.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Dependencies before app code, deliberately. Docker caches each
# instruction as its own layer, keyed on its inputs — as long as
# requirements.txt is unchanged, `docker build` reuses the cached
# "pip install" layer instead of re-running it on every code edit.
# Ordering a Dockerfile by "what changes least often goes first" is most
# of what "writing an efficient Dockerfile" means in practice.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app

# The API's only data source: the same snapshots the Next.js frontend
# reads at build time. Baking them into the image means this container
# serves whatever was committed when the image was built, not live data —
# rebuilding the image is how it picks up a fresher snapshot for now. A
# real production version would fetch this from a database or object
# store at request time instead of the filesystem; that's a later step,
# not something to solve in this Dockerfile.
COPY src/data src/data

# Containers run as root by default, which is more privilege than this
# process ever needs. If a dependency ever had an exploitable bug, running
# as an unprivileged user limits what that exploit could do to the
# container — root-in-a-container is still real root on that filesystem.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser

WORKDIR /app/backend
EXPOSE 8000

# What a Kubernetes liveness probe will call in the next step — defining
# it here means `docker run` already knows how to tell "container started"
# apart from "container is actually answering requests."
HEALTHCHECK --interval=30s --timeout=3s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
