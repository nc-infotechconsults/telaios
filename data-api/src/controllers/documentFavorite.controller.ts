import type { Request, Response } from "express";
import * as favoriteService from "../services/documentFavorite.service";

export async function listFavorites(req: Request, res: Response) {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const documentIds = await favoriteService.listFavorites(userId, req.params.projectId);
  return res.json(documentIds);
}

export async function addFavorite(req: Request, res: Response) {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await favoriteService.addFavorite(req.params.documentId, userId);
  res.status(204).send();
}

export async function removeFavorite(req: Request, res: Response) {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await favoriteService.removeFavorite(req.params.documentId, userId);
  res.status(204).send();
}

export async function checkFavorite(req: Request, res: Response) {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const isFav = await favoriteService.isFavorite(req.params.documentId, userId);
  return res.json({ is_favorite: isFav });
}
