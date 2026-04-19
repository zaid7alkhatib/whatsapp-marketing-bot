import { Router } from "express";
import {
  createServiceRequest,
  getServiceRequestById,
  getServiceRequests,
} from "./service-request.controller";

const serviceRequestRouter = Router();

serviceRequestRouter.get("/", getServiceRequests);
serviceRequestRouter.post("/", createServiceRequest);
serviceRequestRouter.get("/:id", getServiceRequestById);

export default serviceRequestRouter;
