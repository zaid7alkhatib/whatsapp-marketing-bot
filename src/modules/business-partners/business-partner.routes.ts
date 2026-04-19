import { Router } from "express";
import {
  createBusinessPartner,
  getBusinessPartnerById,
  getBusinessPartners,
  updateBusinessPartner,
} from "./business-partner.controller";

const businessPartnerRouter = Router();

businessPartnerRouter.get("/", getBusinessPartners);
businessPartnerRouter.post("/", createBusinessPartner);
businessPartnerRouter.put("/:id", updateBusinessPartner);
businessPartnerRouter.get("/:id", getBusinessPartnerById);

export default businessPartnerRouter;
