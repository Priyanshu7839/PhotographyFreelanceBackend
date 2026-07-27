import express from "express";

import { createClient, createMember, getAllClients, getClientAssets, getTeamMembers, getWorkflowSteps, getWorkflowTemplates, updateClient } from "../Controllers/Client.controller.js";

import { adminOnly, userAuth } from "../middleware/auth.js";

const clientRouter = express.Router();

clientRouter.post(
  "/create-client",
  userAuth,
 adminOnly,
  createClient
);

clientRouter.get(
  "/templates",
  userAuth,
  getWorkflowTemplates
)

clientRouter.get(
  "/templates/:templateId/steps",
  userAuth,
  getWorkflowSteps
);

clientRouter.get(
  "/team-members",
  userAuth,
  getTeamMembers
);


clientRouter.get(
  "/dashboard",
  userAuth,
  getAllClients
);

clientRouter.get(
  "/:clientId/assets",
  userAuth,
  getClientAssets
);

clientRouter.put(
  "/updateclients/:clientId",
  userAuth,
  adminOnly,
  updateClient
);


clientRouter.post("/addmembers", userAuth, createMember);
export default clientRouter;
