import { Router } from "express";
import * as projectMemberController from "../controllers/projectMember.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get("/:projectId/members", requireProjectAccess("viewer"), projectMemberController.listMembers);
router.post("/:projectId/members", requireProjectAccess("owner"), projectMemberController.addMember);
router.patch("/:projectId/members/:userId", requireProjectAccess("owner"), projectMemberController.patchMember);
router.delete("/:projectId/members/:userId", requireProjectAccess("owner"), projectMemberController.removeMember);

export default router;
