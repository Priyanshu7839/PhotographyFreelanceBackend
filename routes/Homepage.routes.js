import express from "express";
import { getHomepageFolderImages, getHomepageFolders, saveFile } from "../Controllers/Homepage.controller.js";
import { userAuth } from "../middleware/auth.js";
const homepageRouter = express.Router();


homepageRouter.get(
  "/folders",
  getHomepageFolders
);

homepageRouter.get(
  "/folders/:variantType",
  getHomepageFolderImages
);


homepageRouter.post(
    '/saveclientassets',userAuth,saveFile
)
export default homepageRouter
