import express from "express";

import { createClient, createMember, getAllClients, getClientAssets, getTeamMembers, getWorkflowSteps, getWorkflowTemplates, resetClientPassword, updateClient } from "../Controllers/Client.controller.js";

import { adminOnly, requireClientAccess, userAuth } from "../middleware/auth.js";

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
  requireClientAccess(),
  getClientAssets
);

clientRouter.put(
  "/updateclients/:clientId",
  userAuth,
  adminOnly,
  updateClient
);

clientRouter.post("/:clientId/reset-password", userAuth, adminOnly, resetClientPassword);


clientRouter.post("/addmembers", userAuth, createMember);
export default clientRouter;
