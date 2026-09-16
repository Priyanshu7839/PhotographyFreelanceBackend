import express from 'express'
const router = express.Router();

import { getUploadUrl,saveFile,startMultipartUpload,getMultipartUploadUrl,completeMultipartUpload,abortMultipartUpload, CreateClient, GetClients, GetSize, getPreviewKey, GetClientImages, GetClientData, SelectImage, saveFileHomepage, GetHomepageImages } from "./upload.controller.js";
import { SendEnquiry } from './nodemailer.js';
import { adminOnly, requireClientAccess, userAuth } from './middleware/auth.js';



router.post("/admin/upload-url", userAuth, adminOnly, getUploadUrl);
router.post("/savetoDb", userAuth, requireClientAccess(), saveFile)
router.post("/savetoDbhomepage",userAuth, adminOnly, saveFileHomepage)
router.post("/multipart/start", userAuth, requireClientAccess(), startMultipartUpload);
router.post("/multipart/sign-part", userAuth, getMultipartUploadUrl);
router.post("/multipart/complete", userAuth, completeMultipartUpload);
router.post("/multipart/abort", userAuth, abortMultipartUpload);
router.post("/createClient", userAuth, adminOnly, CreateClient)
router.get("/clients", userAuth, adminOnly, GetClients)
router.post("/getsize", userAuth, requireClientAccess(), GetSize)

router.post("/getpreviewurl", userAuth, getPreviewKey)
router.post("/getclientimages", userAuth, requireClientAccess(), GetClientImages)
router.post("/getClientData", userAuth, requireClientAccess(), GetClientData)
router.post("/selectImage", userAuth, SelectImage)
router.get("/homepageimages",GetHomepageImages)

router.post("/sendenquiry",SendEnquiry)



export default router;
