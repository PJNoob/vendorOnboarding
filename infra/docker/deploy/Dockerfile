FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:stable
ARG HELM_VERSION=3.17.3
# Same apt setup as the base image's entrypoint.sh: pin kubectl and the SDK packages to the installed gcloud version.
# Pin Helm 3: its rollback/wait flags differ from Helm 4.
RUN version="$(cat /usr/lib/google-cloud-sdk/VERSION)" \
  && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git python3 \
  && echo "deb [signed-by=/etc/apt/keyrings/google-cloud-cli.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list \
  && printf 'Package: google-cloud-cli*\nPin: version %s-0\nPin-Priority: 1001\n\nPackage: kubectl\nPin: version 1:%s-0\nPin-Priority: 1001\n' "$version" "$version" > /etc/apt/preferences.d/google-cloud-cli \
  && apt-get update && apt-get install -y --no-install-recommends "google-cloud-cli=${version}-0" kubectl google-cloud-cli-gke-gcloud-auth-plugin \
  && rm -rf /var/lib/apt/lists/* \
  && curl --fail --silent --show-error --location "https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz" -o /tmp/helm.tar.gz \
  && curl --fail --silent --show-error --location "https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz.sha256sum" -o /tmp/helm.sha256sum \
  && (cd /tmp && sed "s|helm-v${HELM_VERSION}-linux-amd64.tar.gz|helm.tar.gz|" helm.sha256sum | sha256sum --check) \
  && tar -xzf /tmp/helm.tar.gz -C /tmp \
  && install /tmp/linux-amd64/helm /usr/local/bin/helm \
  && rm -rf /tmp/helm* /tmp/linux-amd64
ENV USE_GKE_GCLOUD_AUTH_PLUGIN=True
WORKDIR /workspace
