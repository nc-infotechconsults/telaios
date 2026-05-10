"""S3 / MinIO async wrapper.

Port of ``data-api/src/utils/s3.util.ts``. Uses ``aioboto3`` so all operations
are non-blocking. ``force_path_style`` style is on (required for MinIO).

The session is process-wide; per-call clients are created via async context
managers, which is the documented aioboto3 pattern.
"""

from __future__ import annotations

from functools import lru_cache

import aioboto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from telaios.config.settings import get_settings

__all__ = [
    "build_s3_key",
    "delete_from_s3",
    "ensure_bucket_exists",
    "get_presigned_download_url",
    "upload_to_s3",
]


@lru_cache(maxsize=1)
def _session() -> aioboto3.Session:
    return aioboto3.Session()


def _client_kwargs() -> dict[str, object]:
    settings = get_settings()
    return {
        "service_name": "s3",
        "endpoint_url": settings.S3_ENDPOINT,
        "region_name": settings.S3_REGION,
        "aws_access_key_id": settings.S3_ACCESS_KEY,
        "aws_secret_access_key": settings.S3_SECRET_KEY,
        "config": BotoConfig(s3={"addressing_style": "path"}),
    }


def _bucket() -> str:
    return get_settings().S3_BUCKET


async def upload_to_s3(key: str, body: bytes, content_type: str) -> None:
    async with _session().client(**_client_kwargs()) as client:
        await client.put_object(Bucket=_bucket(), Key=key, Body=body, ContentType=content_type)


async def get_presigned_download_url(key: str, expires_in: int = 3600) -> str:
    async with _session().client(**_client_kwargs()) as client:
        url: str = await client.generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket(), "Key": key},
            ExpiresIn=expires_in,
        )
        return url


async def delete_from_s3(key: str) -> None:
    async with _session().client(**_client_kwargs()) as client:
        await client.delete_object(Bucket=_bucket(), Key=key)


def build_s3_key(project_id: str, document_id: str, filename: str) -> str:
    """Canonical document storage key."""
    return f"projects/{project_id}/documents/{document_id}/{filename}"


async def ensure_bucket_exists() -> None:
    """Create the configured bucket if it doesn't exist (idempotent)."""
    bucket = _bucket()
    async with _session().client(**_client_kwargs()) as client:
        try:
            await client.head_bucket(Bucket=bucket)
        except ClientError:
            await client.create_bucket(Bucket=bucket)
