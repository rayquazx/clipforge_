"""
ClipForge API — MinIO / S3-compatible storage service.

Wraps the ``minio`` SDK to provide simple file CRUD and presigned URL
generation against the configured bucket.
"""

from io import BytesIO
from typing import Union

from minio import Minio

from app.config import get_settings


class StorageService:
    """
    Thin wrapper around the MinIO Python client.

    Instantiate once at startup (or per-request if you prefer) and
    call the helper methods to interact with object storage.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self._bucket = settings.MINIO_BUCKET

    # -- Bucket management ---------------------------------------------------

    def ensure_bucket(self) -> None:
        """Create the configured bucket if it does not already exist."""
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    # -- Object CRUD ---------------------------------------------------------

    def upload_file(
        self,
        key: str,
        data: Union[bytes, BytesIO],
        content_type: str = "application/octet-stream",
    ) -> None:
        """
        Upload *data* to the bucket under the given *key*.

        Accepts raw ``bytes`` or a ``BytesIO`` stream.
        """
        if isinstance(data, bytes):
            data = BytesIO(data)

        length = data.getbuffer().nbytes
        self._client.put_object(
            bucket_name=self._bucket,
            object_name=key,
            data=data,
            length=length,
            content_type=content_type,
        )

    def download_file(self, key: str) -> bytes:
        """Download the object at *key* and return its contents as bytes."""
        response = self._client.get_object(self._bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_presigned_url(self, key: str, expires: int = 3600) -> str:
        """
        Generate a presigned GET URL for the object at *key*.

        Parameters
        ----------
        key:
            Object key inside the bucket.
        expires:
            URL validity in seconds (default 1 hour).
        """
        from datetime import timedelta

        return self._client.presigned_get_object(
            bucket_name=self._bucket,
            object_name=key,
            expires=timedelta(seconds=expires),
        )

    def delete_file(self, key: str) -> None:
        """Remove the object at *key* from the bucket."""
        self._client.remove_object(self._bucket, key)
