#!/usr/bin/env bash
set -euo pipefail

# Build the container image into Minikube's Docker daemon so imagePullPolicy: IfNotPresent works locally
eval "$(minikube docker-env)"
docker build -t base-xmtp-xbt:latest .
echo "Built image base-xmtp-xbt:latest in Minikube's Docker daemon"


