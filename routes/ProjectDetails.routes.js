import express from "express";

import { teamOnly, userAuth } from "../middleware/auth.js";
import { addMoodboardDiscussion, addMoodboardSong, addTravelDiscussion, assignGears, deleteMoodboardSong, downloadFile, getAllGears, getClientHeader, getClientNotes, getClientOverview, getClientWorkflow, getMoodboardAssets, getMoodboardDiscussions, getMoodboardSongs, getProductionOverview, getProductionSetup, getTravelData, getTravelDiscussions, updateClientNotes, updateWorkflowStatus } from "../Controllers/ProjectDetails.controller.js";

const projectRouter = express.Router();
projectRouter.get(
  "/gears",
  userAuth,
  getAllGears
);

projectRouter.get(
  "/:clientId",
  userAuth,
  getClientHeader
);


projectRouter.post(
  "/:clientId/workflow-action/:step_id",
  userAuth,
  teamOnly,
  updateWorkflowStatus
);

projectRouter.get(
  "/:clientId/overview",
  userAuth,
  getClientOverview
);

projectRouter.get(
  "/:clientId/workflow",
  userAuth,
  getClientWorkflow
);


projectRouter.post(
  "/:clientId/moodboard/discussion",
  userAuth,
  addMoodboardDiscussion
);

projectRouter.get(
  "/:clientId/moodboard/discussions",
  userAuth,
  getMoodboardDiscussions
);

projectRouter.put(
  "/:clientId/moodboard/notes",
  userAuth,
  updateClientNotes
);

projectRouter.get(
  "/:clientId/moodboard/notes",
  userAuth,
  getClientNotes
);

projectRouter.post(
  "/:clientId/moodboard/song",
  userAuth,
  addMoodboardSong
);

projectRouter.get(
  "/:clientId/moodboard/songs",
  userAuth,
  getMoodboardSongs
);


projectRouter.delete(
  "/:clientId/moodboard/song/:songId",
  userAuth,
  deleteMoodboardSong
);

projectRouter.get(
  "/moodboard-assets/:clientId",
  userAuth,
  getMoodboardAssets
);

projectRouter.get(
 "/:clientId/production-setup",
  userAuth,
  getProductionSetup
);

projectRouter.post(
  "/:clientId/assign-gears",
  userAuth,
  assignGears
);

projectRouter.get(
  "/:clientId/production-overview",
  userAuth,
  getProductionOverview
);

projectRouter.post(
  "/travel-discussions/:clientId",
  userAuth,
  addTravelDiscussion
);

projectRouter.get(
  "/travel-discussions/:clientId",
  userAuth,
  getTravelDiscussions
);

projectRouter.get(
  "/travel-data/:clientId",
  userAuth,
  getTravelData
);

projectRouter.get(
  "/download/:fileId",
  userAuth,
  downloadFile
);

export default projectRouter;
