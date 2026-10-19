FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AGENT_HOME=/app \
    AGENT_PORT=8088

WORKDIR /app

# Dependencias primero (cache de capas). Las versiones estan fijadas en pyproject.toml.
COPY pyproject.toml ./
COPY src ./src
RUN pip install .

# Configuracion y prompts versionados viajan como archivos (AGENT_HOME=/app)
COPY config ./config
COPY prompts ./prompts

RUN useradd --system --uid 10001 --no-create-home agent && chown -R agent:agent /app
USER agent

EXPOSE 8088

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"AGENT_PORT\",\"8088\")}/health', timeout=2).status == 200 else 1)"

# Secretos (NVIDIA_NIM_API_KEY, AGENT_SHARED_SECRET, LANGFUSE_*) SOLO por variables de entorno en runtime.
CMD ["sh", "-c", "uvicorn okr_agent.api.main:app --host 0.0.0.0 --port ${AGENT_PORT}"]
