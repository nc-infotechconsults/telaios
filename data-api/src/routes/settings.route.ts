import { Router } from "express";
import * as settingsController from "../controllers/settings.controller";
import { requireSystemRole } from "../middleware/requireSystemRole.middleware";

const router = Router();

router.get("/", settingsController.getSettings);
router.get("/raw", requireSystemRole("admin"), settingsController.getRawSettings);
router.patch("/", requireSystemRole("admin"), settingsController.patchSettings);

export default router;
