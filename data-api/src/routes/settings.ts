import { Router } from "express";
import * as settingsController from "../controllers/settings.controller";
import { requireSystemRole } from "../middleware/requireSystemRole";

const router = Router();

router.get("/", settingsController.getSettings);
router.put("/", requireSystemRole("admin"), settingsController.putSettings);

export default router;
