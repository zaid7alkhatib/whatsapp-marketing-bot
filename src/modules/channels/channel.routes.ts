import { Router } from "express";
import {
  createChannel,
  getChannelById,
  getChannels,
  updateChannel,
} from "./channel.controller";

const channelRouter = Router();

channelRouter.get("/", getChannels);
channelRouter.post("/", createChannel);
channelRouter.put("/:id", updateChannel);
channelRouter.get("/:id", getChannelById);

export default channelRouter;
