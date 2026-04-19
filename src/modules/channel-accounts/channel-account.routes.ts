import { Router } from "express";
import {
  createChannelAccount,
  getChannelAccountById,
  getChannelAccounts,
  updateChannelAccount,
} from "./channel-account.controller";

const channelAccountRouter = Router();

channelAccountRouter.get("/", getChannelAccounts);
channelAccountRouter.post("/", createChannelAccount);
channelAccountRouter.put("/:id", updateChannelAccount);
channelAccountRouter.get("/:id", getChannelAccountById);

export default channelAccountRouter;
