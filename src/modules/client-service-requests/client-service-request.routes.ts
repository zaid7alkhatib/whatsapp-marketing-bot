import { Router } from "express";
import { markServiceRequestDone } from "../service-requests/service-request.controller";

const clientServiceRequestRouter = Router();

clientServiceRequestRouter.post("/:id/mark-done", markServiceRequestDone);

export default clientServiceRequestRouter;
