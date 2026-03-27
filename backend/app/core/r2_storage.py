"""
Cloudflare R2 uploads via S3-compatible API (boto3).
Env: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT_URL
"""

from __future__ import annotations

import os
import re
import unicodedata
import uuid
from urllib.parse import quote

from botocore.config import Config


def _require_r2_config() -> tuple[str, str, str, str]:
    access = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.environ.get("R2_BUCKET_NAME", "").strip()
    endpoint = os.environ.get("R2_ENDPOINT_URL", "").strip()
    if not all([access, secret, bucket, endpoint]):
        raise RuntimeError(
            "R2 is not configured (need R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, "
            "R2_BUCKET_NAME, R2_ENDPOINT_URL)"
        )
    return access, secret, bucket, endpoint


def _s3_client():
    import boto3

    access, secret, _bucket, endpoint = _require_r2_config()
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def safe_filename(name: str) -> str:
    """ASCII-safe name for object keys: spaces → _, extension preserved, URL-hostile chars removed."""
    base = os.path.basename(name or "").strip() or "file"
    stem, ext = os.path.splitext(base)
    ext = ext.lower()
    stem = unicodedata.normalize("NFKD", stem)
    stem = "".join(c for c in stem if unicodedata.category(c) != "Mn")
    stem = stem.replace(" ", "_")
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", stem)
    stem = re.sub(r"_+", "_", stem).strip("_") or "file"
    ext_ok = bool(ext and re.match(r"^\.[a-zA-Z0-9]{1,16}$", ext))
    ext_clean = ext if ext_ok else ""
    max_stem = max(1, 200 - len(ext_clean)) if ext_clean else 200
    stem = stem[:max_stem]
    out = stem + ext_clean if ext_clean else stem
    return (out[:200] or "file")[:200]


def build_object_key(unit_id: str, original_name: str) -> str:
    uid = str(uuid.uuid4())
    safe = safe_filename(original_name)
    return f"units/{unit_id}/{uid}-{safe}"


def public_object_url(object_key: str) -> str:
    """Public HTTPS URL for the object (R2_PUBLIC_URL, e.g. r2.dev or custom domain)."""
    base = os.environ.get("R2_PUBLIC_URL", "").strip().rstrip("/")
    if not base:
        raise RuntimeError(
            "R2_PUBLIC_URL is not set (required for public download links)"
        )
    path = "/".join(quote(seg, safe="") for seg in object_key.split("/"))
    return f"{base}/{path}"


def upload_bytes(object_key: str, body: bytes, content_type: str | None) -> str:
    _, _, bucket, _ = _require_r2_config()
    client = _s3_client()
    extra: dict = {}
    if content_type:
        extra["ContentType"] = content_type
    client.put_object(Bucket=bucket, Key=object_key, Body=body, **extra)
    return public_object_url(object_key)
