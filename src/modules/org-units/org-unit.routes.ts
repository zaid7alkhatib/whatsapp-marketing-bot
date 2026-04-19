import { Router } from "express";
import {
  createOrgUnit,
  getOrgUnitById,
  getOrgUnits,
  updateOrgUnit,
} from "./org-unit.controller";

const orgUnitRouter = Router();

orgUnitRouter.get("/", getOrgUnits);
orgUnitRouter.post("/", createOrgUnit);
orgUnitRouter.put("/:id", updateOrgUnit);
orgUnitRouter.get("/:id", getOrgUnitById);

export default orgUnitRouter;
