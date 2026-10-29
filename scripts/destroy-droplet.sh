#!/bin/bash
# ============================================
# Destroy DigitalOcean Droplet after Meeting
# Run this AFTER each meeting to stop charges
# ============================================

DO_TOKEN="YOUR_DIGITALOCEAN_API_TOKEN_HERE"

# Get droplet ID
if [ -f /tmp/mytalk-droplet-id.txt ]; then
  DROPLET_ID=$(cat /tmp/mytalk-droplet-id.txt)
else
  read -p "Enter Droplet ID: " DROPLET_ID
fi

echo "Destroying droplet $DROPLET_ID..."

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" \
  -H "Authorization: Bearer $DO_TOKEN")

if [ "$RESPONSE" = "204" ]; then
  echo "Droplet destroyed! Billing stopped."
  rm -f /tmp/mytalk-droplet-id.txt
else
  echo "ERROR: Failed to destroy. HTTP $RESPONSE"
  echo "Go to DigitalOcean dashboard and delete manually!"
fi
