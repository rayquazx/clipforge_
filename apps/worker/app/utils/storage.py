"""
ClipForge Worker — MinIO / S3-compatible storage helpers.

Provides thin wrappers around the ``minio`` SDK for uploading and
downloading objects used by the worker tasks.
"""

from __future__ import annotations

import os

from minio import Minio


def get_minio_client() -> Minio:
    """Create a MinIO client from environment variables.

    Environment variables
    ---------------------
    MINIO_ENDPOINT : str
        Host and port (e.g. ``"localhost:9000"``).  Defaults to
        ``"localhost:9000"``.
    MINIO_ACCESS_KEY : str
        Access key.  Defaults to ``"minioadmin"``.
    MINIO_SECRET_KEY : str
        Secret key.  Defaults to ``"minioadmin"``.

    Returns
    -------
    Minio
        Configured client instance (HTTP, not HTTPS, by default).
    """
    return Minio(
        endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        secure=False,
    )


def upload_file(
    client: Minio,
    bucket: str,
    key: str,
    file_path: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload a local file to MinIO.

    Parameters
    ----------
    client:
        MinIO client returned by :func:`get_minio_client`.
    bucket:
        Target bucket name.
    key:
        Object key (path inside the bucket).
    file_path:
        Absolute path of the local file to upload.
    content_type:
        MIME type of the uploaded object.

    Returns
    -------
    str
        The object key that was written.
    """
    # Ensure the bucket exists before writing.
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)

    client.fput_object(
        bucket_name=bucket,
        object_name=key,
        file_path=file_path,
        content_type=content_type,
    )
    return key


def download_file(
    client: Minio,
    bucket: str,
    key: str,
    dest_path: str,
) -> str:
    """Download an object from MinIO to a local file.

    Parameters
    ----------
    client:
        MinIO client returned by :func:`get_minio_client`.
    bucket:
        Source bucket name.
    key:
        Object key to download.
    dest_path:
        Local path where the file will be saved.

    Returns
    -------
    str
        The *dest_path* that was written.
    """
    client.fget_object(
        bucket_name=bucket,
        object_name=key,
        file_path=dest_path,
    )
    return dest_path
