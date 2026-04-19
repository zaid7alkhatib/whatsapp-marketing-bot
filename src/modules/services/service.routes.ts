import { Router } from "express";
import {
  createService,
  getServiceById,
  getServices,
  updateService,
} from "./service.controller";

const serviceRouter = Router();

serviceRouter.get("/", getServices);
serviceRouter.post("/", createService);
serviceRouter.put("/:id", updateService);
serviceRouter.get("/:id", getServiceById);

export default serviceRouter;
