import { Router } from "express";
import {
  cancelOutreachCampaign,
  createOutreachCampaign,
  getOutreachCampaignById,
  getOutreachCampaigns,
} from "./whatsapp-outreach.controller";
import {
  createOutreachTemplate,
  deleteOutreachTemplate,
  getOutreachTemplates,
  updateOutreachTemplate,
} from "./outreach-template.controller";

const whatsappOutreachRouter = Router();

whatsappOutreachRouter.get("/campaigns", getOutreachCampaigns);
whatsappOutreachRouter.post("/campaigns", createOutreachCampaign);
whatsappOutreachRouter.get("/campaigns/:id", getOutreachCampaignById);
whatsappOutreachRouter.post("/campaigns/:id/cancel", cancelOutreachCampaign);
whatsappOutreachRouter.get("/templates", getOutreachTemplates);
whatsappOutreachRouter.post("/templates", createOutreachTemplate);
whatsappOutreachRouter.put("/templates/:id", updateOutreachTemplate);
whatsappOutreachRouter.delete("/templates/:id", deleteOutreachTemplate);

export default whatsappOutreachRouter;
