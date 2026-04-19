import { AppDataSource } from "../configs/data-source.config";
import { DocumentComment } from "../entities/DocumentComment.entity";
import type { CreateCommentDto, PatchCommentDto } from "../schemas/documentComment.schema";

const repo = () => AppDataSource.getRepository(DocumentComment);

export async function listComments(documentId: string): Promise<DocumentComment[]> {
  return repo().find({
    where: { document_id: documentId },
    order: { created_at: "ASC" },
    relations: ["author"],
  });
}

export async function getComment(commentId: string): Promise<DocumentComment | null> {
  return repo().findOne({ where: { id: commentId }, relations: ["author"] });
}

export async function createComment(
  documentId: string,
  userId: string | null,
  dto: CreateCommentDto,
): Promise<DocumentComment> {
  return repo().save(
    repo().create({
      document_id: documentId,
      user_id: userId,
      content: dto.content,
      anchor_type: dto.anchor_type ?? "general",
      anchor_data: dto.anchor_data ?? null,
      parent_comment_id: dto.parent_comment_id ?? null,
    }),
  );
}

export async function patchComment(commentId: string, dto: PatchCommentDto): Promise<DocumentComment | null> {
  const comment = await repo().findOneBy({ id: commentId });
  if (!comment) return null;
  if (dto.content !== undefined) comment.content = dto.content;
  if (dto.resolved !== undefined) comment.resolved = dto.resolved;
  return repo().save(comment);
}

export async function deleteComment(commentId: string): Promise<void> {
  await repo().delete({ id: commentId });
}
