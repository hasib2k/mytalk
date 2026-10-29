#!/bin/bash
# ============================================
# Create DigitalOcean Droplet for Meeting
# Run this BEFORE each meeting from your PC
# ============================================

# ---- CONFIGURE THESE (one-time) ----
DO_TOKEN="YOUR_DIGITALOCEAN_API_TOKEN_HERE"
DOMAIN="lk.yourdomain.com"       # Your LiveKit domain
CF_API_TOKEN=""                    # Cloudflare API token (if using Cloudflare DNS)
CF_ZONE_ID=""                      # Cloudflare Zone ID (if using Cloudflare DNS)
CF_RECORD_ID=""                    # Cloudflare DNS Record ID (if using Cloudflare DNS)
# -------------------------------------

echo "=== Creating DigitalOcean Droplet ==="

# Create CPU-Optimized droplet (8 vCPU, 16GB RAM) in Singapore
RESPONSE=$(curl -s -X POST "https://api.digitalocean.com/v2/droplets" \
  -H "Authorization: Bearer $DO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mytalk-livekit",
    "region": "sgp1",
    "size": "c-8-16gib",
    "image": "ubuntu-22-04-x64",
    "ssh_keys": [],
    "backups": false,
    "monitoring": true,
    "tags": ["mytalk"]
  }')

DROPLET_ID=$(echo "$RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

if [ -z "$DROPLET_ID" ]; then
  echo "ERROR: Failed to create droplet"
  echo "$RESPONSE"
  exit 1
fi

echo "Droplet created! ID: $DROPLET_ID"
echo "Waiting for IP address..."

# Wait for droplet to get an IP
sleep 30

IP=$(curl -s "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" \
  -H "Authorization: Bearer $DO_TOKEN" \
  | grep -o '"ip_address":"[^"]*"' | head -1 | cut -d'"' -f4)

echo ""
echo "============================================"
echo "  Droplet IP: $IP"
echo "  Droplet ID: $DROPLET_ID"
echo "============================================"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Update DNS: Point $DOMAIN → $IP"
echo "   (Change A record in your domain provider)"
echo ""
echo "2. Wait 2-3 minutes for droplet to boot"
echo ""
echo "3. SSH into the droplet:"
echo "   ssh root@$IP"
echo ""
echo "4. Run the setup script:"
echo "   curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/setup-livekit.sh | bash"
echo "   (or copy-paste the setup-livekit.sh content)"
echo ""
echo "5. After meeting, DESTROY the droplet:"
echo "   curl -s -X DELETE \"https://api.digitalocean.com/v2/droplets/$DROPLET_ID\" -H \"Authorization: Bearer $DO_TOKEN\""
echo ""
echo "Save this droplet ID to destroy later: $DROPLET_ID"

# Save droplet ID for later destruction
echo "$DROPLET_ID" > /tmp/mytalk-droplet-id.txt
