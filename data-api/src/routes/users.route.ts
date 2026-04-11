import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { requireSystemRole } from "../middleware/requireSystemRole.middleware";

const router = Router();

router.use(requireSystemRole("admin"));

router.get("/", userController.listUsers);
router.get("/:id", userController.getUser);
router.patch("/:id", userController.patchUser);
router.delete("/:id", userController.deleteUser);

export default router;
