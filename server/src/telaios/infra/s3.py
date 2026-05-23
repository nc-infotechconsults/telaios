"""S3 / MinIO async store — class-based interface with lifecycle.

Replaces the module-level function API with a proper ``S3Store`` class.
The module-level convenience functions remain for backward compatibility.

Usage::

    from telaios.infra.s3 import S3Store

    store = S3Store.from_settings()
    await store.upload("key", b"data", "text/plain")
    url = await store.presigned_download_url("key")
    data = await store.download("key")
    await store.delete("key")
"""

from __future__ import annotations

from functools import lru_cache

import aioboto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from telaios.config.settings import get_settings


class S3Store:
    """Async S3/MinIO object store backed by aioboto3."""

    def __init__(
        self,
        *,
        endpoint_url: str,
        region_name: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        force_path_style: bool = True,
    ) -> None:
        self._endpoint_url = endpoint_url
        self._region_name = region_name
        self._access_key = access_key
        self._secret_key = secret_key
        self._bucket = bucket
        self._force_path_style = force_path_style

    @classmethod
    def from_settings(cls) -> S3Store:
        """Create from application settings."""
        s = get_settings()
        return cls(
            endpoint_url=s.S3_ENDPOINT,
            region_name=s.S3_REGION,
            access_key=s.S3_ACCESS_KEY,
            secret_key=s.S3_SECRET_KEY,
            bucket=s.S3_BUCKET,
            force_path_style=s.S3_FORCE_PATH_STYLE,
        )

    @property
    def bucket(self) -> str:
        return self._bucket

    def _client_kwargs(self) -> dict[str, object]:
        return {
            "service_name": "s3",
            "endpoint_url": self._endpoint_url,
            "region_name": self._region_name,
            "aws_access_key_id": self._access_key,
            "aws_secret_access_key": self._secret_key,
            "config": BotoConfig(s3={"addressing_style": "path"})
            if self._force_path_style
            else BotoConfig(),
        }

    async def upload(self, key: str, body: bytes, content_type: str) -> None:
        async with self._session().client(**self._client_kwargs()) as client:
            await client.put_object(
                Bucket=self._bucket, Key=key, Body=body, ContentType=content_type
            )

    async def download(self, key: str) -> bytes:
        async with self._session().client(**self._client_kwargs()) as client:
            response = await client.get_object(Bucket=self._bucket, Key=key)
            body: bytes = await response["Body"].read()
            return body

    async def delete(self, key: str) -> None:
        async with self._session().client(**self._client_kwargs()) as client:
            await client.delete_object(Bucket=self._bucket, Key=key)

    async def presigned_download_url(self, key: str, expires_in: int = 3600) -> str:
        async with self._session().client(**self._client_kwargs()) as client:
            url: str = await client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
            )
            return url

    async def ensure_bucket_exists(self) -> None:
        """Create the configured bucket if it doesn't exist (idempotent)."""
        async with self._session().client(**self._client_kwargs()) as client:
            try:
                await client.head_bucket(Bucket=self._bucket)
            except ClientError:
                await client.create_bucket(Bucket=self._bucket)

    @staticmethod
    @lru_cache(maxsize=1)
    def _session() -> aioboto3.Session:
        return aioboto3.Session()

    @staticmethod
    def build_key(project_id: str, document_id: str, filename: str) -> str:
        """Canonical document storage key."""
        return f"projects/{project_id}/documents/{document_id}/{filename}"


# ── Backward-compatible module-level API ──────────────────────────────────

_store: S3Store | None = None


def _get_store() -> S3Store:
    global _store
    if _store is None:
        _store = S3Store.from_settings()
    return _store


async def upload_to_s3(key: str, body: bytes, content_type: str) -> None:
    await _get_store().upload(key, body, content_type)


async def download_from_s3(key: str) -> bytes:
    return await _get_store().download(key)


async def delete_from_s3(key: str) -> None:
    await _get_store().delete(key)


async def get_presigned_download_url(key: str, expires_in: int = 3600) -> str:
    return await _get_store().presigned_download_url(key, expires_in)


async def ensure_bucket_exists() -> None:
    await _get_store().ensure_bucket_exists()


def build_s3_key(project_id: str, document_id: str, filename: str) -> str:
    return S3Store.build_key(project_id, document_id, filename)
