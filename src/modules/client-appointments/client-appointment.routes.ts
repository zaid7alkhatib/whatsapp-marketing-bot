import { Router } from "express";
import {
  getMedicalAppointmentScheduleOptions,
  submitMedicalAppointmentDecision,
} from "../service-requests/service-request.controller";

const clientAppointmentRouter = Router();

clientAppointmentRouter.get("/schedule-options", getMedicalAppointmentScheduleOptions);
clientAppointmentRouter.post("/:id/decision", submitMedicalAppointmentDecision);

export default clientAppointmentRouter;
