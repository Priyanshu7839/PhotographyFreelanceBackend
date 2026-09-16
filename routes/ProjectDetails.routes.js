import express from "express";

import { adminOnly, clientOnly, requireClientAccess, requireFileAccess, requireProjectStepAccess, teamOnly, userAuth } from "../middleware/auth.js";
import { addInvoiceItem, addMoodboardDiscussion, addMoodboardSong, addProjectStep, addTravelDiscussion, assignGears, deleteInvoiceItem, deleteMoodboardSong, downloadFile, getAllGears, getClientHeader, getClientInvoice, getClientLicenses, getClientNotes, getClientOverview, getClientWorkflow, getContractStatus, getMoodboardAssets, getMoodboardDiscussions, getMoodboardSongs, getProductionOverview, getProductionSetup, getProjectStepsForTravel, getTravelData, getTravelDiscussions, signContract, updateClientNotes, updateInvoiceItem, updateProjectStep, updateProjectStepTravel, updateWorkflowStatus } from "../Controllers/ProjectDetails.controller.js";

const projectRouter = express.Router();
projectRouter.get(
  "/gears",
  userAuth,
  getAllGears
);

projectRouter.get(
  "/:clientId",
  userAuth,
  requireClientAccess(),
  getClientHeader
);


projectRouter.post(
  "/:clientId/workflow-action/:step_id",
  userAuth,
  requireClientAccess(),
  teamOnly,
  updateWorkflowStatus
);

projectRouter.get(
  "/:clientId/overview",
  userAuth,
  requireClientAccess(),
  getClientOverview
);

projectRouter.get(
  "/:clientId/workflow",
  userAuth,
  requireClientAccess(),
  getClientWorkflow
);


projectRouter.post(
  "/:clientId/moodboard/discussion",
  userAuth,
  requireClientAccess(),
  addMoodboardDiscussion
);

projectRouter.get(
  "/:clientId/moodboard/discussions",
  userAuth,
  requireClientAccess(),
  getMoodboardDiscussions
);

projectRouter.put(
  "/:clientId/moodboard/notes",
  userAuth,
  requireClientAccess(),
  updateClientNotes
);

projectRouter.get(
  "/:clientId/moodboard/notes",
  userAuth,
  requireClientAccess(),
  getClientNotes
);

projectRouter.post(
  "/:clientId/moodboard/song",
  userAuth,
  requireClientAccess(),
  addMoodboardSong
);

projectRouter.get(
  "/:clientId/moodboard/songs",
 userAuth,
  requireClientAccess(),
  getMoodboardSongs
);


projectRouter.delete(
  "/:clientId/moodboard/song/:songId",
  userAuth,
  requireClientAccess(),
  deleteMoodboardSong
);

projectRouter.get(
  "/moodboard-assets/:clientId",
  userAuth,
  requireClientAccess(),
  getMoodboardAssets
);

projectRouter.get(
 "/:clientId/production-setup",
  userAuth,
  requireClientAccess(),
  getProductionSetup
);

projectRouter.post(
  "/:clientId/assign-gears",
  userAuth,
  requireClientAccess(),
  assignGears
);

projectRouter.get(
  "/:clientId/production-overview",
  userAuth,
  requireClientAccess(),
  getProductionOverview
);

projectRouter.post(
  "/travel-discussions/:clientId",
  userAuth,
  requireClientAccess(),
  addTravelDiscussion
);

projectRouter.get(
  "/travel-discussions/:clientId",
  userAuth,
  requireClientAccess(),
  getTravelDiscussions
);

projectRouter.get(
  "/travel-data/:clientId",
  userAuth,
  requireClientAccess(),
  getTravelData
);

projectRouter.get(
  "/download/:fileId",
  userAuth,
  requireFileAccess,
  downloadFile
);

projectRouter.post(
  "/:clientId/addsteps",
  userAuth,
  requireClientAccess(),
  teamOnly,
  addProjectStep
);

projectRouter.get(
  "/contract-status/:clientId",
  userAuth,
  requireClientAccess(),
  getContractStatus
);

projectRouter.put(
  "/:clientId/sign-contract",
  userAuth,
  requireClientAccess(),
  clientOnly,
  signContract
);

projectRouter.get(
  "/:clientId/licenses",
  userAuth,
  requireClientAccess(),
  getClientLicenses
);

projectRouter.get(
  "/:client_id/invoice",
  userAuth,
  requireClientAccess("client_id"),
  getClientInvoice
);

projectRouter.post(
  "/:clientId/invoices/items",
  userAuth,
  requireClientAccess(),
  addInvoiceItem
);


projectRouter.post("/updateInvoiceItem", userAuth, adminOnly, updateInvoiceItem);
projectRouter.post("/deleteInvoiceItem", userAuth, adminOnly, deleteInvoiceItem);

projectRouter.get(
  "/travel/projectSteps/:clientId",
  userAuth,
  requireClientAccess(),
  getProjectStepsForTravel
);


projectRouter.put(
  "/travel/:clientId/:projectStepId",
  userAuth,
  requireClientAccess(),
  updateProjectStepTravel
);


projectRouter.post(
  "/project-steps/:project_step_id",
  userAuth,
  requireProjectStepAccess,
  teamOnly,
  updateProjectStep
);
export default projectRouter;
