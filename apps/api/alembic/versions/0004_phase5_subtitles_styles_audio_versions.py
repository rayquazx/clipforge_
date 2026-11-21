"""Phase 5: subtitle_styles, audio_assets, edit_versions tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-21 15:00:00.000000
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. subtitle_styles table
    if not inspector.has_table('subtitle_styles'):
        op.create_table(
            'subtitle_styles',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('font_family', sa.String(length=100), nullable=False, server_default='Montserrat'),
            sa.Column('font_size', sa.Integer(), nullable=False, server_default='36'),
            sa.Column('primary_color', sa.String(length=20), nullable=False, server_default='#FFFFFF'),
            sa.Column('outline_color', sa.String(length=20), nullable=False, server_default='#000000'),
            sa.Column('outline_width', sa.Float(), nullable=False, server_default='2.5'),
            sa.Column('box_color', sa.String(length=20), nullable=True),
            sa.Column('shadow_color', sa.String(length=20), nullable=True),
            sa.Column('position', sa.String(length=20), nullable=False, server_default='bottom'),
            sa.Column('uppercase', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('preset_type', sa.String(length=50), nullable=False, server_default='classic'),
            sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index('ix_subtitle_styles_user_id', 'subtitle_styles', ['user_id'])
        op.create_index('ix_subtitle_styles_is_system', 'subtitle_styles', ['is_system'])

        # Seed system preset styles
        preset_table = sa.table(
            'subtitle_styles',
            sa.column('id', postgresql.UUID(as_uuid=True)),
            sa.column('user_id', postgresql.UUID(as_uuid=True)),
            sa.column('name', sa.String),
            sa.column('font_family', sa.String),
            sa.column('font_size', sa.Integer),
            sa.column('primary_color', sa.String),
            sa.column('outline_color', sa.String),
            sa.column('outline_width', sa.Float),
            sa.column('box_color', sa.String),
            sa.column('shadow_color', sa.String),
            sa.column('position', sa.String),
            sa.column('uppercase', sa.Boolean),
            sa.column('preset_type', sa.String),
            sa.column('is_system', sa.Boolean),
        )
        op.bulk_insert(
            preset_table,
            [
                {
                    'id': uuid.UUID('11111111-1111-1111-1111-111111111001'),
                    'user_id': None,
                    'name': 'Classic',
                    'font_family': 'Montserrat',
                    'font_size': 36,
                    'primary_color': '#FFFFFF',
                    'outline_color': '#000000',
                    'outline_width': 2.5,
                    'box_color': None,
                    'shadow_color': None,
                    'position': 'bottom',
                    'uppercase': False,
                    'preset_type': 'classic',
                    'is_system': True,
                },
                {
                    'id': uuid.UUID('11111111-1111-1111-1111-111111111002'),
                    'user_id': None,
                    'name': 'Boxed',
                    'font_family': 'Inter',
                    'font_size': 34,
                    'primary_color': '#FFFFFF',
                    'outline_color': '#000000',
                    'outline_width': 1.0,
                    'box_color': '#000000CC',
                    'shadow_color': None,
                    'position': 'bottom',
                    'uppercase': False,
                    'preset_type': 'boxed',
                    'is_system': True,
                },
                {
                    'id': uuid.UUID('11111111-1111-1111-1111-111111111003'),
                    'user_id': None,
                    'name': 'Karaoke',
                    'font_family': 'Anton',
                    'font_size': 42,
                    'primary_color': '#FFFF00',
                    'outline_color': '#000000',
                    'outline_width': 3.5,
                    'box_color': None,
                    'shadow_color': '#000000AA',
                    'position': 'bottom',
                    'uppercase': True,
                    'preset_type': 'karaoke',
                    'is_system': True,
                },
                {
                    'id': uuid.UUID('11111111-1111-1111-1111-111111111004'),
                    'user_id': None,
                    'name': 'Bold Pop',
                    'font_family': 'Roboto',
                    'font_size': 44,
                    'primary_color': '#00FFFF',
                    'outline_color': '#000000',
                    'outline_width': 4.0,
                    'box_color': None,
                    'shadow_color': '#000000FF',
                    'position': 'middle',
                    'uppercase': True,
                    'preset_type': 'bold_pop',
                    'is_system': True,
                },
            ]
        )

    # 2. audio_assets table
    if not inspector.has_table('audio_assets'):
        op.create_table(
            'audio_assets',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
            sa.Column('title', sa.String(length=200), nullable=False),
            sa.Column('artist', sa.String(length=200), nullable=True),
            sa.Column('duration_sec', sa.Float(), nullable=False),
            sa.Column('storage_key', sa.String(length=500), nullable=False),
            sa.Column('file_size_bytes', sa.Integer(), nullable=True),
            sa.Column('is_bundled', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('license_info', sa.String(length=500), nullable=True),
            sa.Column('genre', sa.String(length=100), nullable=True),
            sa.Column('waveform_peaks', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index('ix_audio_assets_user_id', 'audio_assets', ['user_id'])
        op.create_index('ix_audio_assets_is_bundled', 'audio_assets', ['is_bundled'])

    # 3. edit_versions table
    if not inspector.has_table('edit_versions'):
        op.create_table(
            'edit_versions',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('clip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clips.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('version', sa.Integer(), nullable=False),
            sa.Column('edit_state', sa.JSON(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        )
        op.create_index('ix_edit_versions_clip_version', 'edit_versions', ['clip_id', 'version'])


def downgrade() -> None:
    op.drop_table('edit_versions')
    op.drop_table('audio_assets')
    op.drop_table('subtitle_styles')
