import { Router } from "express";
import {
  generateQuestions,
  createUser,
  getInterviews,
  submitAnswer,
  totalScore,
  stats,
  getUsers,
  badge,
  suggestedAnswer,
} from "./controller.js";

const router = Router();
router.post("/questions", generateQuestions);
router.post("/user", createUser);
router.post("/interviews", getInterviews);
router.post("/submit", submitAnswer);
router.post("/total", totalScore);
router.post("/stats", stats);
router.get("/users", getUsers);
router.post("/badge", badge);
router.post("/suggest", suggestedAnswer);

export default router;
