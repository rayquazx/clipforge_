"""Initial database schema for ClipForge

Revision ID: 0001
Revises: 
Create Date: 2026-11-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True, index=True),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 2. projects
    op.create_table(
        'projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('source_url', sa.Text(), nullable=True),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('title', sa.String(length=500), nullable=True),
        sa.Column('channel_name', sa.String(length=255), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('thumbnail_url', sa.Text(), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='queued'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('mode', sa.String(length=50), nullable=False, server_default='both'),
        sa.Column('clip_count_target', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('clip_length_min', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('clip_length_max', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('raw_video_key', sa.String(length=500), nullable=True),
        sa.Column('audio_key', sa.String(length=500), nullable=True),
        sa.Column('project_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'source_url', name='uq_projects_user_source_url'),
    )
    op.create_index('ix_projects_user_created', 'projects', ['user_id', sa.text('created_at DESC')])

    # 3. clips
    op.create_table(
        'clips',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('start_time', sa.Float(), nullable=False),
        sa.Column('end_time', sa.Float(), nullable=False),
        sa.Column('funny_score', sa.Float(), nullable=True),
        sa.Column('sad_score', sa.Float(), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='detected'),
        sa.Column('editor_state', sa.JSON(), nullable=True),
        sa.Column('preview_key', sa.String(length=500), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 4. transcript_segments
    op.create_table(
        'transcript_segments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='SET NULL'), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('start_time', sa.Float(), nullable=False),
        sa.Column('end_time', sa.Float(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('speaker', sa.String(length=100), nullable=True),
        sa.Column('word_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 5. chat_messages
    op.create_table(
        'chat_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('username', sa.String(length=200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('timestamp_seconds', sa.Float(), nullable=False),
        sa.Column('emote_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 6. ads
    op.create_table(
        'ads',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('ad_type', sa.String(length=50), nullable=False),
        sa.Column('asset_key', sa.String(length=500), nullable=True),
        sa.Column('banner_text', sa.Text(), nullable=True),
        sa.Column('style', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 7. ad_placements
    op.create_table(
        'ad_placements',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ad_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('placement_type', sa.String(length=50), nullable=False),
        sa.Column('start_time', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('duration', sa.Float(), nullable=False, server_default='5.0'),
        sa.Column('opacity', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('position', sa.String(length=50), nullable=False, server_default='bottom_right'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 8. text_overlays
    op.create_table(
        'text_overlays',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('start_time', sa.Float(), nullable=False),
        sa.Column('end_time', sa.Float(), nullable=False),
        sa.Column('style', sa.JSON(), nullable=True),
        sa.Column('z_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 9. music_tracks
    op.create_table(
        'music_tracks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('asset_key', sa.String(length=500), nullable=False),
        sa.Column('start_time', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('volume', sa.Float(), nullable=False, server_default='0.5'),
        sa.Column('loop', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 10. exports
    op.create_table(
        'exports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='queued'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('output_key', sa.String(length=500), nullable=True),
        sa.Column('aspect_ratio', sa.String(length=20), nullable=False, server_default='16:9'),
        sa.Column('width', sa.Integer(), nullable=False, server_default='1920'),
        sa.Column('height', sa.Integer(), nullable=False, server_default='1080'),
        sa.Column('format', sa.String(length=20), nullable=False, server_default='mp4'),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('render_settings', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('exports')
    op.drop_table('music_tracks')
    op.drop_table('text_overlays')
    op.drop_table('ad_placements')
    op.drop_table('ads')
    op.drop_table('chat_messages')
    op.drop_table('transcript_segments')
    op.drop_table('clips')
    op.drop_index('ix_projects_user_created', table_name='projects')
    op.drop_table('projects')
    op.drop_table('users')
