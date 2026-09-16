import express from "express";
import { createVendor, getVendorMedia, listVendors, setVendorConsent } from "../Controllers/Vendor.controller.js";
import { adminOnly, clientOnly, requireClientAccess, userAuth } from "../middleware/auth.js";

const vendorRouter = express.Router();

vendorRouter.get("/:clientId", userAuth, requireClientAccess(), listVendors);
vendorRouter.post("/:clientId", userAuth, adminOnly, createVendor);
vendorRouter.put("/:clientId/consent", userAuth, requireClientAccess(), clientOnly, setVendorConsent);
vendorRouter.get("/:clientId/media", userAuth, requireClientAccess(), getVendorMedia);

export default vendorRouter;
