#!/bin/bash
cloudflared tunnel --url http://localhost:5180 2>&1 | tee /tmp/cloudflared-dreamsoap.log