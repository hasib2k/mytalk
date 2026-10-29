#!/bin/bash
# ============================================
# LiveKit Server Auto-Setup Script
# Run this ON the DigitalOcean droplet after creation
# ============================================

# Exit on error
set -e

echo "=== LiveKit Server Setup ==="

# 1. Update system
echo ">> Updating system..."
apt-get update && apt-get upgrade -y

# 2. Install required packages
echo ">> Installing dependencies..."
apt-get install -y curl wget apt-transport-https ca-certificates

# 3. Install LiveKit Server
echo ">> Installing LiveKit Server..."
curl -sSL https://get.livekit.io | bash

# 4. Generate API keys
API_KEY=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 24 | head -n 1)
API_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 48 | head -n 1)

echo ""
echo "============================================"
echo "  SAVE THESE KEYS (you'll need them):"
echo "============================================"
echo "  LIVEKIT_API_KEY:    $API_KEY"
echo "  LIVEKIT_API_SECRET: $API_SECRET"
echo "============================================"
echo ""

# 5. Ask for domain
read -p "Enter your LiveKit domain (e.g. lk.yourdomain.com): " LK_DOMAIN

# 6. Install Caddy (for automatic SSL)
echo ">> Installing Caddy (SSL reverse proxy)..."
apt-get install -y debian-keyring debian-archive-keyring
curl -1sLf 'https://dl.cloudflare.com/content/pkg/deb/setup.deb.sh' | bash 2>/dev/null || true
curl -sSL https://caddyserver.com/api/download?os=linux&arch=amd64 -o /usr/local/bin/caddy 2>/dev/null || true

# Use snap as fallback for Caddy
if ! command -v caddy &> /dev/null; then
  snap install caddy 2>/dev/null || true
fi

# If caddy still not available, use certbot + nginx approach
if ! command -v caddy &> /dev/null; then
  echo ">> Using certbot for SSL..."
  apt-get install -y certbot
  # Get SSL certificate
  certbot certonly --standalone -d "$LK_DOMAIN" --agree-tos --register-unsafely-without-email --non-interactive

  SSL_CERT="/etc/letsencrypt/live/$LK_DOMAIN/fullchain.pem"
  SSL_KEY="/etc/letsencrypt/live/$LK_DOMAIN/privkey.pem"

  # Create LiveKit config with SSL
  cat > /etc/livekit.yaml <<YAML
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  tcp_port: 7881
keys:
  $API_KEY: $API_SECRET
turn:
  enabled: true
  domain: $LK_DOMAIN
  tls_port: 5349
  udp_port: 3478
  external_tls: true
YAML

  echo ">> SSL certificate obtained!"
else
  # Create LiveKit config without SSL (Caddy will handle it)
  cat > /etc/livekit.yaml <<YAML
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  tcp_port: 7881
keys:
  $API_KEY: $API_SECRET
turn:
  enabled: true
  domain: $LK_DOMAIN
  tls_port: 5349
  udp_port: 3478
  external_tls: true
YAML

  # Create Caddyfile
  cat > /etc/caddy/Caddyfile <<CADDY
$LK_DOMAIN {
  reverse_proxy localhost:7880
}
CADDY

  # Start Caddy
  systemctl enable caddy
  systemctl start caddy
  echo ">> Caddy started with auto-SSL!"
fi

# 7. Configure firewall
echo ">> Configuring firewall..."
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP (for SSL cert)
ufw allow 443/tcp     # HTTPS
ufw allow 7880/tcp    # LiveKit API
ufw allow 7881/tcp    # LiveKit TCP
ufw allow 3478/udp    # TURN UDP
ufw allow 5349/tcp    # TURN TLS
ufw allow 50000:60000/udp  # WebRTC media
ufw --force enable

# 8. Create systemd service for LiveKit
cat > /etc/systemd/system/livekit.service <<SERVICE
[Unit]
Description=LiveKit Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/livekit-server --config /etc/livekit.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# 9. Start LiveKit
echo ">> Starting LiveKit Server..."
systemctl daemon-reload
systemctl enable livekit
systemctl start livekit

# Wait and check
sleep 3
if systemctl is-active --quiet livekit; then
  echo ""
  echo "============================================"
  echo "  LiveKit Server is RUNNING!"
  echo "============================================"
  echo ""
  echo "  WebSocket URL: wss://$LK_DOMAIN"
  echo ""
  echo "  Add these to your Vercel env vars:"
  echo "  LIVEKIT_URL=wss://$LK_DOMAIN"
  echo "  LIVEKIT_API_KEY=$API_KEY"
  echo "  LIVEKIT_API_SECRET=$API_SECRET"
  echo ""
  echo "============================================"
else
  echo "ERROR: LiveKit failed to start. Check: journalctl -u livekit -f"
fi
