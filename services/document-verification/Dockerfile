FROM python:3.13-slim
WORKDIR /service
COPY pyproject.toml .
COPY vendor_verification ./vendor_verification
RUN pip install --no-cache-dir . && useradd --uid 1000 --create-home service
USER service
EXPOSE 8080
CMD ["uvicorn", "vendor_verification.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080"]
