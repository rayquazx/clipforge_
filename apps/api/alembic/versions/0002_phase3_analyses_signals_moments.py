"""Phase 3: analyses, signal_windows, moments tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-21 01:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. analyses table
    op.create_table(
        'analyses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('mode', sa.String(length=50), nullable=False, server_default='both'),
        sa.Column('min_clip_seconds', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('max_clip_seconds', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('max_clips', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('language', sa.String(length=20), nullable=True, server_default='auto'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='queued'),
        sa.Column('stage', sa.String(length=50), nullable=True, server_default='queued'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('config_snapshot', sa.JSON(), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_analyses_project_id', 'analyses', ['project_id'])

    # 2. signal_windows table
    op.create_table(
        'signal_windows',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('analysis_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('analyses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('start_sec', sa.Float(), nullable=False),
        sa.Column('end_sec', sa.Float(), nullable=False),
        sa.Column('audio_energy', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('laughter_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('scream_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('silence_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('chat_rate', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('emote_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('sentiment_pos', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('sentiment_neg', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('funny_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('sad_score', sa.Float(), nullable=False, server_default='0.0'),
    )
    op.create_index('ix_signal_windows_analysis_start', 'signal_windows', ['analysis_id', 'start_sec'])

    # 3. moments table
    op.create_table(
        'moments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('analysis_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('analyses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('start_sec', sa.Float(), nullable=False),
        sa.Column('end_sec', sa.Float(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=False),
        sa.Column('transcript_excerpt', sa.Text(), nullable=False, server_default=''),
        sa.Column('signals_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_moments_analysis_score', 'moments', ['analysis_id', 'score'])

    # 4. Add analysis_id and avg_logprob to transcript_segments if not already present
    try:
        op.add_column('transcript_segments', sa.Column('analysis_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('analyses.id', ondelete='CASCADE'), nullable=True))
        op.create_index('ix_transcript_segments_analysis_id', 'transcript_segments', ['analysis_id'])
    except Exception:
        pass

    try:
        op.add_column('transcript_segments', sa.Column('start_sec', sa.Float(), nullable=True))
        op.add_column('transcript_segments', sa.Column('end_sec', sa.Float(), nullable=True))
        op.add_column('transcript_segments', sa.Column('avg_logprob', sa.Float(), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    op.drop_table('moments')
    op.drop_table('signal_windows')
    op.drop_table('analyses')
