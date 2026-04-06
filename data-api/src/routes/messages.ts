import { Router } from "express";
import * as messageController from "../controllers/message.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess";

const router = Router();

router.get("/", requireProjectAccess("viewer"), messageController.listMessages);
router.post("/", requireProjectAccess("editor"), messageController.createMessage);

export default router;
