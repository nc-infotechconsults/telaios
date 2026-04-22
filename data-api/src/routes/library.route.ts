import { Router } from "express";
import * as libraryController from "../controllers/library.controller";

const router = Router();

// ─── Agents ───────────────────────────────────────────────────────────────────
router.get("/agents", libraryController.listLibraryAgents);
router.get("/agents/:id", libraryController.getLibraryAgent);
router.post("/agents", libraryController.createLibraryAgent);
router.put("/agents/:id", libraryController.updateLibraryAgent);
router.delete("/agents/:id", libraryController.deleteLibraryAgent);

// ─── MCPs ─────────────────────────────────────────────────────────────────────
router.get("/mcps", libraryController.listLibraryMcps);
router.post("/mcps", libraryController.createLibraryMcp);
router.get("/mcps/:id", libraryController.getLibraryMcp);
router.put("/mcps/:id", libraryController.updateLibraryMcp);
router.delete("/mcps/:id", libraryController.deleteLibraryMcp);

// ─── Skills ───────────────────────────────────────────────────────────────────
router.get("/skills", libraryController.listLibrarySkills);
router.post("/skills", libraryController.createLibrarySkill);
router.get("/skills/:id/export", libraryController.exportLibrarySkill);
router.get("/skills/:id", libraryController.getLibrarySkill);
router.put("/skills/:id", libraryController.updateLibrarySkill);
router.delete("/skills/:id", libraryController.deleteLibrarySkill);

export default router;
