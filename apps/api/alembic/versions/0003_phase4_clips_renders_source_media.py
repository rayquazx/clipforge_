"""Phase 4: clips, renders, source_media tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-21 03:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update clips table
    # Check if columns need to be added or updated
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = [c['name'] for c in inspector.get_columns('clips')] if inspector.has_table('clips') else []

    if not inspector.has_table('clips'):
        op.create_table(
            'clips',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
            sa.Column('analysis_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('analyses.id', ondelete='SET NULL'), nullable=True),
            sa.Column('moment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('moments.id', ondelete='SET NULL'), nullable=True),
            sa.Column('title', sa.String(length=300), nullable=False),
            sa.Column('category', sa.String(length=50), nullable=False, server_default='custom'),
            sa.Column('source_start_sec', sa.Float(), nullable=False),
            sa.Column('source_end_sec', sa.Float(), nullable=False),
            sa.Column('edit_state', sa.JSON(), nullable=False),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='draft'),
            sa.Column('thumbnail_key', sa.String(length=500), nullable=True),
            sa.Column('score', sa.Float(), nullable=True),
            sa.Column('reason', sa.String(length=500), nullable=True),
            sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
            sa.UniqueConstraint('analysis_id', 'moment_id', name='uq_clips_analysis_moment'),
        )
    else:
        # Add new columns to clips
        if 'user_id' not in existing_cols:
            op.add_column('clips', sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True))
            # Backfill user_id from projects if needed
            op.execute("UPDATE clips SET user_id = projects.user_id FROM projects WHERE clips.project_id = projects.id")
            op.alter_column('clips', 'user_id', nullable=False)
        if 'analysis_id' not in existing_cols:
            op.add_column('clips', sa.Column('analysis_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('analyses.id', ondelete='SET NULL'), nullable=True))
        if 'moment_id' not in existing_cols:
            op.add_column('clips', sa.Column('moment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('moments.id', ondelete='SET NULL'), nullable=True))
        if 'source_start_sec' not in existing_cols:
            op.add_column('clips', sa.Column('source_start_sec', sa.Float(), nullable=True))
            if 'start_time' in existing_cols:
                op.execute("UPDATE clips SET source_start_sec = start_time")
            op.alter_column('clips', 'source_start_sec', nullable=False)
        if 'source_end_sec' not in existing_cols:
            op.add_column('clips', sa.Column('source_end_sec', sa.Float(), nullable=True))
            if 'end_time' in existing_cols:
                op.execute("UPDATE clips SET source_end_sec = end_time")
            op.alter_column('clips', 'source_end_sec', nullable=False)
        if 'edit_state' not in existing_cols:
            op.add_column('clips', sa.Column('edit_state', sa.JSON(), nullable=True))
            op.execute("""
                UPDATE clips
                SET edit_state = json_build_object(
                    'schema_version', 1,
                    'trim', json_build_object('start', source_start_sec, 'end', source_end_sec)
                )
            """)
            op.alter_column('clips', 'edit_state', nullable=False)
        if 'thumbnail_key' not in existing_cols:
            op.add_column('clips', sa.Column('thumbnail_key', sa.String(length=500), nullable=True))
        if 'score' not in existing_cols:
            op.add_column('clips', sa.Column('score', sa.Float(), nullable=True))
        if 'reason' not in existing_cols:
            op.add_column('clips', sa.Column('reason', sa.String(length=500), nullable=True))
        if 'version' not in existing_cols:
            op.add_column('clips', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))

        # Check and add unique constraint on (analysis_id, moment_id)
        try:
            op.create_unique_constraint('uq_clips_analysis_moment', 'clips', ['analysis_id', 'moment_id'])
        except Exception:
            pass

    try:
        op.create_index('ix_clips_user_id', 'clips', ['user_id'])
        op.create_index('ix_clips_project_id', 'clips', ['project_id'])
        op.create_index('ix_clips_analysis_id', 'clips', ['analysis_id'])
        op.create_index('ix_clips_user_created', 'clips', ['user_id', sa.text('created_at DESC')])
    except Exception:
        pass

    # 2. renders table
    if not inspector.has_table('renders'):
        op.create_table(
            'renders',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='CASCADE'), nullable=False),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='queued'),
            sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('options', sa.JSON(), nullable=False),
            sa.Column('output_key', sa.String(length=500), nullable=True),
            sa.Column('file_size', sa.BigInteger(), nullable=True),
            sa.Column('duration_sec', sa.Float(), nullable=True),
            sa.Column('width', sa.Integer(), nullable=True),
            sa.Column('height', sa.Integer(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_renders_clip_id', 'renders', ['clip_id'])

    # 3. source_media table
    if not inspector.has_table('source_media'):
        op.create_table(
            'source_media',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
            sa.Column('kind', sa.String(length=50), nullable=False, server_default='video'),
            sa.Column('storage_key', sa.String(length=500), nullable=False),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='missing'),
            sa.Column('width', sa.Integer(), nullable=True),
            sa.Column('height', sa.Integer(), nullable=True),
            sa.Column('duration_sec', sa.Float(), nullable=True),
            sa.Column('format', sa.String(length=50), nullable=True),
            sa.Column('covered_range', sa.JSON(), nullable=True),
            sa.Column('last_used_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_source_media_project_id', 'source_media', ['project_id'])


def downgrade() -> None:
    op.drop_table('source_media')
    op.drop_table('renders')
