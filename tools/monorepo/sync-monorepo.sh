#!/usr/bin/env bash
# Sincroniza los repos fuente (okr-platform-back / okr-platform-front) hacia el monorepo
# publicado en GitHub (Elm-flock/iaday), conservando el historial con git subtree.
#
# Fuente de verdad: los repos separados. El monorepo es un espejo:
#   apps/back   <- okr-platform-back (rama master)
#   apps/front  <- okr-platform-front (rama master)
#   apps/agent  <- okr-platform-agent (rama main; agente Python de IA, ADK + NVIDIA NIM)
#   docs/design-system, docs/ai, tools/demo, spikes/pdf-json-render (solo código) <- workspace iaday/
# Nunca incluye docs/reference (libro con derechos de autor).
#
# Uso (desde WSL):  bash tools/monorepo/sync-monorepo.sh [--push]
set -euo pipefail

WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # workspace iaday/
MONO="$WS/okr-platform-monorepo"
REMOTE="git@github.com:Elm-flock/iaday.git"
BACK="$WS/okr-platform-back"
FRONT="$WS/okr-platform-front"
AGENT="$WS/okr-platform-agent"
PUSH=""
ALLOW_DIRTY=""
for arg in "$@"; do
  case "$arg" in
    --push) PUSH="--push" ;;
    --allow-dirty) ALLOW_DIRTY="1" ;;
  esac
done

# git subtree solo toma commits: los cambios sin commitear NO se suben.
# Por defecto aborta para que nadie crea que publicó trabajo en curso.
# El agente es opcional: si su repo no existe o todavía no tiene commits (subtree solo toma commits),
# se omite con un aviso en vez de abortar. Una vez que tenga su primer commit, la próxima corrida lo agrega.
SYNC_AGENT=""
if [ -d "$AGENT/.git" ] && git -C "$AGENT" rev-parse --verify -q HEAD >/dev/null; then
  SYNC_AGENT="1"
else
  echo "[sync] AVISO: $AGENT no existe o no tiene commits; se omite apps/agent (commiteá el agente y volvé a correr)." >&2
fi

REPOS=("$BACK" "$FRONT")
[ -n "$SYNC_AGENT" ] && REPOS+=("$AGENT")
for repo in "${REPOS[@]}"; do
  if [ -n "$(git -C "$repo" status --porcelain)" ]; then
    if [ -n "$ALLOW_DIRTY" ]; then
      echo "[sync] AVISO: $repo tiene cambios sin commitear; se publica solo lo commiteado." >&2
    else
      echo "[sync] ERROR: $repo tiene cambios sin commitear. Commiteá antes o usá --allow-dirty." >&2
      exit 1
    fi
  fi
done

if [ ! -d "$MONO/.git" ]; then
  echo "[sync] Creando monorepo en $MONO"
  mkdir -p "$MONO"
  git -C "$MONO" init -q -b main
  git -C "$MONO" config user.name "$(git -C "$BACK" log -1 --format=%an)"
  git -C "$MONO" config user.email "$(git -C "$BACK" log -1 --format=%ae)"
  git -C "$MONO" config core.autocrlf false
  cp "$WS/tools/monorepo/root/README.md" "$WS/tools/monorepo/root/.gitignore" "$WS/tools/monorepo/root/.gitattributes" "$MONO/"
  git -C "$MONO" add -A
  git -C "$MONO" commit -q -m "chore(monorepo): estructura inicial del monorepo"
  git -C "$MONO" remote add origin "$REMOTE"
fi

sync_app() {
  local prefix="$1" src="$2" branch="${3:-master}"
  if [ -d "$MONO/$prefix" ]; then
    echo "[sync] subtree pull $prefix <- $src"
    git -C "$MONO" subtree pull -q --prefix="$prefix" "$src" "$branch" -m "chore(sync): actualizar $prefix desde su repo fuente"
  else
    echo "[sync] subtree add $prefix <- $src (con historial)"
    git -C "$MONO" subtree add -q --prefix="$prefix" "$src" "$branch"
  fi
}
sync_app apps/back "$BACK"
sync_app apps/front "$FRONT"
[ -n "$SYNC_AGENT" ] && sync_app apps/agent "$AGENT" main

echo "[sync] Copiando docs, tools y spikes (sin artefactos)"
mkdir -p "$MONO/docs/design-system" "$MONO/docs/ai" "$MONO/tools/demo" "$MONO/tools/monorepo" "$MONO/spikes/pdf-json-render"
rsync -a --delete "$WS/docs/design-system/" "$MONO/docs/design-system/"
rsync -a --delete "$WS/docs/ai/" "$MONO/docs/ai/"
rsync -a --delete --exclude '.api.pid' --exclude '.front.pid' --exclude '.agent.pid' --exclude '*.log' --exclude '*.log.err' \
  "$WS/tools/demo/" "$MONO/tools/demo/"
rsync -a --delete --exclude 'sync-monorepo.local*' "$WS/tools/monorepo/" "$MONO/tools/monorepo/"
rsync -a --delete --exclude 'node_modules' --exclude '.next' --exclude 'out' --exclude '*.tsbuildinfo' \
  "$WS/spikes/pdf-json-render/" "$MONO/spikes/pdf-json-render/"
cp "$WS/tools/monorepo/root/README.md" "$WS/tools/monorepo/root/.gitignore" "$WS/tools/monorepo/root/.gitattributes" "$MONO/"

git -C "$MONO" add -A
if git -C "$MONO" diff --cached --quiet; then
  echo "[sync] Sin cambios en docs/tools/spikes."
else
  git -C "$MONO" commit -q -m "chore(sync): actualizar docs, herramientas de demo y spike del PDF"
fi

# Salvaguarda: el libro nunca debe estar en el monorepo
if git -C "$MONO" ls-files | grep -qiE 'measure-what-matters|docs/reference'; then
  echo "[sync] ERROR: se detectó material de docs/reference en el monorepo. Abortando antes del push." >&2
  exit 1
fi

git -C "$MONO" log --oneline -5
if [ "$PUSH" = "--push" ]; then
  echo "[sync] Push a $REMOTE"
  git -C "$MONO" push -u origin main
else
  echo "[sync] Listo (sin push). Para publicar: bash tools/monorepo/sync-monorepo.sh --push"
fi
