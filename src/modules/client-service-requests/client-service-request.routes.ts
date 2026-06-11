import { Router } from "express";
import {
  markServiceRequestDone,
  rejectServiceRequest,
} from "../service-requests/service-request.controller";

const clientServiceRequestRouter = Router();

clientServiceRequestRouter.post("/:id/mark-done", markServiceRequestDone);
clientServiceRequestRouter.post("/:id/reject", rejectServiceRequest);

export default clientServiceRequestRouter;
