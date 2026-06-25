import { Router } from "express";
import {
  createContactSection,
  deleteContactSection,
  getContactSectionById,
  getContactSections,
  updateContactSection,
} from "./contact-section.controller";

const contactSectionRouter = Router();

contactSectionRouter.get("/", getContactSections);
contactSectionRouter.post("/", createContactSection);
contactSectionRouter.get("/:id", getContactSectionById);
contactSectionRouter.put("/:id", updateContactSection);
contactSectionRouter.delete("/:id", deleteContactSection);

export default contactSectionRouter;

