import { Router } from "express";
import {
  createRequestType,
  getRequestTypeById,
  getRequestTypes,
  updateRequestType,
} from "./request-type.controller";

const requestTypeRouter = Router();

requestTypeRouter.get("/", getRequestTypes);
requestTypeRouter.post("/", createRequestType);
requestTypeRouter.put("/:id", updateRequestType);
requestTypeRouter.get("/:id", getRequestTypeById);

export default requestTypeRouter;
