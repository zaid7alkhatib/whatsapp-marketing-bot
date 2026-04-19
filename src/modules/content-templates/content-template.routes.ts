import { Router } from "express";
import {
  createContentTemplate,
  getContentTemplateById,
  getContentTemplates,
  updateContentTemplate,
} from "./content-template.controller";

const contentTemplateRouter = Router();

contentTemplateRouter.get("/", getContentTemplates);
contentTemplateRouter.post("/", createContentTemplate);
contentTemplateRouter.put("/:id", updateContentTemplate);
contentTemplateRouter.get("/:id", getContentTemplateById);

export default contentTemplateRouter;
