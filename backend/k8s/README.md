# Running buff-api on local Kubernetes

Manifests here describe two things K8s should keep true, not steps to run
once:

- **`deployment.yaml`** — always have 2 copies of `buff-api` running,
  restart any that crash or fail their liveness probe, keep unready pods
  out of traffic until their readiness probe passes.
- **`service.yaml`** — give those pods one stable address (`buff-api`,
  port 80) that keeps working as individual pods come and go.

## Local dev loop (kind)

No cloud account, no registry — [`kind`](https://kind.sigs.k8s.io/) runs a
real Kubernetes cluster inside Docker on your own machine.

```bash
# One-time: create the cluster
kind create cluster --name buff

# Build the image (repo root is the build context — see backend/Dockerfile)
docker build -f backend/Dockerfile -t buff-api:dev .

# Load it straight into the cluster's node — no registry involved.
# This is why deployment.yaml uses imagePullPolicy: IfNotPresent instead
# of Always: an Always pull would try to fetch from a registry and fail,
# since this image was never pushed anywhere.
kind load docker-image buff-api:dev --name buff

kubectl apply -f backend/k8s/

# Watch the Deployment reach 2/2 ready
kubectl get pods -w

# The Service has no external IP by design (ClusterIP) — port-forward to
# reach it from your machine
kubectl port-forward svc/buff-api 8000:80
curl http://localhost:8000/health
```

## After a code change

```bash
docker build -f backend/Dockerfile -t buff-api:dev .
kind load docker-image buff-api:dev --name buff
kubectl rollout restart deployment/buff-api
kubectl rollout status deployment/buff-api
```

`rollout restart` is what actually exercises "rolled out without
downtime": watch `kubectl get pods -w` in another terminal while it runs —
new pods come up and pass their readiness probe before old ones terminate,
so the Service never has zero ready pods to route to.

## Tear down

```bash
kind delete cluster --name buff
```
