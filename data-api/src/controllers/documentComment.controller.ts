import type { Request, Response } from "express";
import { CreateCommentSchema, PatchCommentSchema } from "../schemas/documentComment.schema";
import * as commentService from "../services/documentComment.service";
import * as activityService from "../services/documentActivity.service";

export async function listComments(req: Request, res: Response) {
  const comments = await commentService.listComments(req.params.documentId);
  res.json(comments);
}

export async function createComment(req: Request, res: Response) {
  const parsed = CreateCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const comment = await commentService.createComment(req.params.documentId, userId, parsed.data);

  void activityService.recordActivity(req.params.documentId, userId, "commented", {
    comment_id: comment.id,
  });

  return res.status(201).json(comment);
}

export async function patchComment(req: Request, res: Response) {
  const parsed = PatchCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await commentService.patchComment(req.params.commentId, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteComment(req: Request, res: Response) {
  const comment = await commentService.getComment(req.params.commentId);
  if (!comment) return res.status(404).json({ error: "Not found" });
  await commentService.deleteComment(req.params.commentId);
  res.status(204).send();
}
