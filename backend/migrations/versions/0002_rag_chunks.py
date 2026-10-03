"""material chunks (RAG riil)

Revision ID: 0002_rag_chunks
Revises: 0001_courses
Create Date: 2026-10-02

Tabel `material_chunks`: satu baris = satu chunk teks yang benar-benar
diparse dari byte file di `course_materials.storage_path`. `chunk_count`
di `course_materials` tetap jadi SUM yang dibaca UI — yang berubah hanya
produsennya: dari angka seed artifisial menjadi COUNT baris tabel ini.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '0002_rag_chunks'
down_revision: str | None = '0001_courses'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'material_chunks',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('material_id', sa.String(length=64), nullable=False),
        sa.Column('offering_id', sa.String(length=64), nullable=True),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('token_count', sa.Integer(), nullable=False),
        sa.Column('embedding', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.CheckConstraint('chunk_index >= 0', name=op.f('ck_material_chunks_ck_chunk_index')),
        sa.CheckConstraint('token_count >= 0', name=op.f('ck_material_chunks_ck_chunk_tokens')),
        sa.ForeignKeyConstraint(['material_id'], ['course_materials.id'], name=op.f('fk_material_chunks_material_id_course_materials'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['offering_id'], ['course_offerings.id'], name=op.f('fk_material_chunks_offering_id_course_offerings'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_material_chunks')),
    )
    with op.batch_alter_table('material_chunks', schema=None) as batch_op:
        batch_op.create_index('ix_chunk_material', ['material_id', 'chunk_index'], unique=False)
        batch_op.create_index('ix_chunk_offering', ['offering_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('material_chunks', schema=None) as batch_op:
        batch_op.drop_index('ix_chunk_offering')
        batch_op.drop_index('ix_chunk_material')
    op.drop_table('material_chunks')
