"""Phase 6: ad_assets, ad_templates, batches, batch_items tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-21 16:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. ad_assets table
    if not inspector.has_table('ad_assets'):
        op.create_table(
            'ad_assets',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('kind', sa.String(length=20), nullable=False),
            sa.Column('storage_key', sa.String(length=500), nullable=True),
            sa.Column('thumbnail_key', sa.String(length=500), nullable=True),
            sa.Column('duration_sec', sa.Float(), nullable=True),
            sa.Column('width', sa.Integer(), nullable=True),
            sa.Column('height', sa.Integer(), nullable=True),
            sa.Column('has_audio', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('file_size', sa.BigInteger(), nullable=True),
            sa.Column('text_config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='processing'),
            sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index('ix_ad_assets_user_id', 'ad_assets', ['user_id'])
        op.create_index('ix_ad_assets_kind', 'ad_assets', ['kind'])
        op.create_index('ix_ad_assets_status', 'ad_assets', ['status'])

    # 2. ad_templates table
    if not inspector.has_table('ad_templates'):
        op.create_table(
            'ad_templates',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('placements', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
            sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index('ix_ad_templates_user_id', 'ad_templates', ['user_id'])

    # 3. batches table
    if not inspector.has_table('batches'):
        op.create_table(
            'batches',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('status', sa.String(length=30), nullable=False, server_default='queued'),
            sa.Column('ad_template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('ad_templates.id', ondelete='SET NULL'), nullable=True),
            sa.Column('options', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
            sa.Column('ads_mode', sa.String(length=20), nullable=False, server_default='keep'),
            sa.Column('zip_key', sa.String(length=500), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_batches_user_id', 'batches', ['user_id'])
        op.create_index('ix_batches_status', 'batches', ['status'])

    # 4. batch_items table
    if not inspector.has_table('batch_items'):
        op.create_table(
            'batch_items',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('batch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('batches.id', ondelete='CASCADE'), nullable=False),
            sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='CASCADE'), nullable=False),
            sa.Column('render_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('renders.id', ondelete='SET NULL'), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='queued'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index('ix_batch_items_batch_id', 'batch_items', ['batch_id'])
        op.create_index('ix_batch_items_clip_id', 'batch_items', ['clip_id'])
        op.create_index('ix_batch_items_render_id', 'batch_items', ['render_id'])
        op.create_index('ix_batch_items_status', 'batch_items', ['status'])


def downgrade() -> None:
    op.drop_table('batch_items')
    op.drop_table('batches')
    op.drop_table('ad_templates')
    op.drop_table('ad_assets')
