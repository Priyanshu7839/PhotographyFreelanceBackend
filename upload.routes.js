import express from 'express'
const router = express.Router();

import { getUploadUrl,saveFile,startMultipartUpload,getMultipartUploadUrl,completeMultipartUpload,abortMultipartUpload, CreateClient, GetClients, GetSize, getPreviewKey, GetClientImages, GetClientData, SelectImage, saveFileHomepage, GetHomepageImages } from "./upload.controller.js";
import { SendEnquiry } from './nodemailer.js';



router.post("/admin/upload-url", getUploadUrl);
router.post("/savetoDb",saveFile)
router.post("/savetoDbhomepage",saveFileHomepage)
router.post("/multipart/start", startMultipartUpload);
router.post("/multipart/sign-part", getMultipartUploadUrl);
router.post("/multipart/complete", completeMultipartUpload);
router.post("/multipart/abort", abortMultipartUpload);
router.post("/createClient",CreateClient)
router.get("/clients",GetClients)
router.post("/getsize",GetSize)

router.post("/getpreviewurl",getPreviewKey)
router.post("/getclientimages",GetClientImages)
router.post("/getClientData",GetClientData)
router.post("/selectImage",SelectImage)
router.get("/homepageimages",GetHomepageImages)

router.post("/sendenquiry",SendEnquiry)



export default router;