import { Router } from "express";
import {
  createClientUser,
  getClientUsers,
  updateClientUser,
} from "./dashboard-user.controller";

const dashboardUserRouter = Router();

dashboardUserRouter.get("/", getClientUsers);
dashboardUserRouter.post("/", createClientUser);
dashboardUserRouter.put("/:id", updateClientUser);

export default dashboardUserRouter;
