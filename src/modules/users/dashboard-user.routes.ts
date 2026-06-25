import { Router } from "express";
import {
  createDashboardUserController,
  deleteDashboardUserController,
  listDashboardUsersController,
  updateDashboardUserController,
} from "./dashboard-user.controller";

const dashboardUserRouter = Router();

dashboardUserRouter.get("/", listDashboardUsersController);
dashboardUserRouter.post("/", createDashboardUserController);
dashboardUserRouter.patch("/:userId", updateDashboardUserController);
dashboardUserRouter.delete("/:userId", deleteDashboardUserController);

export default dashboardUserRouter;
