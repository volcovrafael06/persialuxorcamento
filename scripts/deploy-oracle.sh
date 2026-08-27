#!/usr/bin/env bash
# scripts/deploy-oracle.sh
# Zera o servidor Oracle ARM (167.126.31.192) e sobe o Persialux.
# Mantém: ollama.service, nginx, Node 22 do .local
# Remove: adspro*, adsrafapro, systemds antigos, site nginx saas-ads
#
# Uso: bash scripts/deploy-oracle.sh
set -euo pipefail

HOST="167.126.31.192"
USER_REMOTE="ubuntu"
KEY="/tmp/oracle_key"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="/home/${USER_REMOTE}/persialuxorcamento-main"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { printf "${GREEN}[%(%H:%M:%S)T]${NC} %s\n" -1 "$*"; }
warn() { printf "${YELLOW}[%(%H:%M:%S)T]${NC} %s\n" -1 "$*"; }
err()  { printf "${RED}[%(%H:%M:%S)T] ERRO:${NC} %s\n" -1 "$*" >&2; }

SSH_OPT=(-i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes)
SSH="ssh ${SSH_OPT[@]} ${USER_REMOTE}@${HOST}"
SSH_SUDO="ssh ${SSH_OPT[@]} ${USER_REMOTE}@${HOST} sudo"

# Etapa 0 — preflight
log "Preflight: testando conectividade com ${HOST}..."
$SSH 'echo OK; uname -a; whoami' || { err "SSH falhou"; exit 1; }

# Etapa 1 — para systemds antigos (sudo NOPASSWD funcionando)
log "Parando services antigos (adspro-api/web/worker)..."
$SSH_SUDO bash -c '
  for s in adspro-api adspro-web adspro-worker; do
    systemctl stop "$s" 2>/dev/null || true
    systemctl disable "$s" 2>/dev/null || true
    rm -f "/etc/systemd/system/${s}.service"
  done
  systemctl daemon-reload
  echo "systemd limpo"
' || warn "Falha ao parar (talvez já estivessem parados)"

# Mata qualquer node ouvindo em 3000
log "Liberando porta 3000..."
$SSH_SUDO bash -c 'fuser -k 3000/tcp 2>/dev/null; sleep 1; ss -tlnp 2>/dev/null | grep ":3000 " || echo "porta 3000 livre"' || true

# Etapa 2 — remove pastas dos projetos antigos
log "Removendo ~/adspro, ~/adsrafapro, ~/seo20-main, ~/sh..."
$SSH bash -c '
  cd ~
  rm -rf adspro adsrafapro seo20-main sh 2>/dev/null
  ls -la
' || warn "Falha ao remover (pode já não existir)"

# Etapa 3 — remove site nginx antigo
log "Removendo sites nginx antigos..."
$SSH_SUDO bash -c '
  rm -f /etc/nginx/sites-enabled/saas-ads-rafa.comercial.ws
  rm -f /etc/nginx/sites-available/saas-ads-rafa.comercial.ws
  rm -f /etc/nginx/sites-enabled/adspro-domain
  rm -f /etc/nginx/sites-available/adspro-domain
  rm -f /etc/nginx/sites-enabled/seo20-ip
  rm -f /etc/nginx/sites-available/seo20-ip
  echo "sites ativos:"
  ls /etc/nginx/sites-enabled/
'

# Etapa 4 — rsync do projeto local pro servidor
log "Sincronizando projeto local → ${REMOTE_DIR}..."
mkdir -p "${LOCAL_DIR}"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.vite' \
  --exclude '.claude' \
  --exclude '.git' \
  --exclude 'scripts/deploy-oracle.sh' \
  --exclude 'agentdb.rvf*' \
  --exclude 'ruvector.db' \
  --exclude '*.key*' \
  --exclude 'ssh-key-*' \
  --exclude 'scripts/import/' \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes" \
  "${LOCAL_DIR}/" "${USER_REMOTE}@${HOST}:${REMOTE_DIR}/" \
  || { err "rsync falhou"; exit 1; }

# Etapa 5 — instala deps no servidor
log "Instalando dependências no servidor (npm ci)..."
$SSH bash -c "
  export PATH=/home/${USER_REMOTE}/.local/bin:\$PATH
  if ! grep -q '.local/bin' ~/.bashrc 2>/dev/null; then
    echo 'export PATH=/home/${USER_REMOTE}/.local/bin:\$PATH' >> ~/.bashrc
  fi
  cd ${REMOTE_DIR}
  node --version
  npm --version
  npm ci --no-audit --no-fund 2>&1 | tail -15
" || { err "npm ci falhou"; exit 1; }

# Etapa 6 — build de produção
log "Buildando o app (npm run build)..."
$SSH bash -c "
  export PATH=/home/${USER_REMOTE}/.local/bin:\$PATH
  cd ${REMOTE_DIR}
  npm run build 2>&1 | tail -20
" || { err "build falhou"; exit 1; }

# Etapa 7 — cria systemd unit
log "Criando persialux-web.service..."
$SSH_SUDO tee /etc/systemd/system/persialux-web.service >/dev/null <<EOF
[Unit]
Description=Persialux static web (Vite build)
After=network.target

[Service]
Type=simple
User=${USER_REMOTE}
WorkingDirectory=${REMOTE_DIR}
Environment=PATH=/home/${USER_REMOTE}/.local/bin:/usr/local/bin:/usr/bin
Environment=NODE_ENV=production
ExecStart=/home/${USER_REMOTE}/.local/bin/npx vite preview --host 0.0.0.0 --port 4173
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

$SSH_SUDO systemctl daemon-reload
$SSH_SUDO systemctl enable persialux-web.service

# Etapa 8 — configura nginx
log "Criando site nginx persialux..."
$SSH_SUDO tee /etc/nginx/sites-available/persialux >/dev/null <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ 167.126.31.192;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }
}
EOF

$SSH_SUDO ln -sf /etc/nginx/sites-available/persialux /etc/nginx/sites-enabled/persialux
$SSH_SUDO nginx -t || { err "nginx config inválida"; exit 1; }
$SSH_SUDO systemctl reload nginx

# Etapa 9 — inicia o app
log "Iniciando persialux-web..."
$SSH_SUDO systemctl restart persialux-web.service
sleep 4
if $SSH_SUDO systemctl is-active persialux-web.service; then
  log "persialux-web: ACTIVE"
else
  err "persialux-web não subiu. Logs:"
  $SSH_SUDO journalctl -u persialux-web -n 50 --no-pager
  exit 1
fi

# Etapa 10 — verificação
log "Verificando endpoints..."
sleep 2
HTTP_ROOT=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}/")
HTTP_BUDGETS=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}/budgets")
HTTP_ORCAMENTO=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}/orcamento-v2")
log "GET /              → HTTP ${HTTP_ROOT}"
log "GET /budgets       → HTTP ${HTTP_BUDGETS}"
log "GET /orcamento-v2  → HTTP ${HTTP_ORCAMENTO}"

if [[ "$HTTP_ROOT" == "200" && "$HTTP_BUDGETS" == "200" ]]; then
  log ""
  log "=========================================="
  log "DEPLOY CONCLUÍDO"
  log "App disponível em: http://${HOST}"
  log "=========================================="
else
  err "Algum endpoint retornou erro. Logs:"
  $SSH_SUDO journalctl -u persialux-web -n 30 --no-pager
  exit 1
fi
