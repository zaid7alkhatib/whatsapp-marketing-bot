import { Router } from "express";
import { getInterestedLeads } from "./interested-lead.controller";

const interestedLeadRouter = Router();

interestedLeadRouter.get("/", getInterestedLeads);

export default interestedLeadRouter;

