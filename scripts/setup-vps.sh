#!/bin/bash
# setup-vps.sh — Configurações necessárias na VPS após deploy
# Executar como root em: ssh root@76.13.174.151
# Uso: bash /var/www/catecismo/scripts/setup-vps.sh

set -e

echo "=== Configurando Nginx para /perguntas/{slug} ==="
cat > /etc/nginx/sites-available/catecismo << 'NGINX'
server {
    listen 80;
    server_name santadoutrina.cloud www.santadoutrina.cloud;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name santadoutrina.cloud www.santadoutrina.cloud;

    ssl_certificate     /etc/letsencrypt/live/santadoutrina.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/santadoutrina.cloud/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/catecismo;
    index index.html;

    # Rotas limpas para /perguntas/{slug}
    location ~ ^/perguntas/[^/]+$ {
        try_files $uri $uri/ /perguntas/resposta.html;
    }

    # Proxy API resumo
    location /api/resumo {
        proxy_pass http://localhost:3000/api/resumo;
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    # Proxy webhook deploy
    location /deploy {
        proxy_pass http://localhost:9000;
        proxy_set_header X-Hub-Signature-256 $http_x_hub_signature_256;
        proxy_set_header X-GitHub-Event $http_x_github_event;
    }

    # Arquivos estáticos
    location / {
        try_files $uri $uri/ $uri.html =404;
    }
}
NGINX

nginx -t && systemctl reload nginx
echo "✓ Nginx configurado e recarregado"

echo ""
echo "=== Configurando cron para Liturgia do Dia ==="
# Verifica se já existe entrada
if crontab -l 2>/dev/null | grep -q "gera-liturgia-diaria"; then
    echo "⏩ Cron já configurado"
else
    # Adiciona cron: roda às 6h todos os dias
    (crontab -l 2>/dev/null; echo "0 6 * * * GROK_API_KEY=\$GROK_API_KEY node /var/www/catecismo/scripts/gera-liturgia-diaria.js >> /var/log/liturgia.log 2>&1") | crontab -
    echo "✓ Cron adicionado (6h diário)"
    echo "  ATENÇÃO: Edite o crontab para adicionar o valor real de GROK_API_KEY:"
    echo "  crontab -e"
    echo "  Linha: 0 6 * * * GROK_API_KEY=sua_chave_aqui node /var/www/catecismo/scripts/gera-liturgia-diaria.js"
fi

echo ""
echo "=== Gerando liturgia de hoje ==="
if [ -z "$GROK_API_KEY" ]; then
    echo "⚠  GROK_API_KEY não definida. Execute manualmente:"
    echo "   GROK_API_KEY=sua_chave node /var/www/catecismo/scripts/gera-liturgia-diaria.js"
else
    node /var/www/catecismo/scripts/gera-liturgia-diaria.js
fi

echo ""
echo "=== Concluído ==="
