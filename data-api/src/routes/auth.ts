import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authenticate } from "../middleware/authenticate";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", authenticate, authController.me);

export default router;
