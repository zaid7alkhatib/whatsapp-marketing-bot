import { Router } from "express";
import { loginController, logoutController, meController } from "./auth.controller";
import { requireAuth } from "../../shared/middlewares/auth";

const authRouter = Router();

authRouter.post("/login", loginController);
authRouter.get("/me", requireAuth, meController);
authRouter.post("/logout", requireAuth, logoutController);

export default authRouter;
