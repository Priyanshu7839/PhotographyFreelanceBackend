import express from "express";
import rateLimit from "express-rate-limit";
import { adminOnly, userAuth } from "../middleware/auth.js";
import { attachCall, createBooking, getBooking, listBookings, publicCatalog, quote, updateBooking } from "./booking.controller.js";

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.BOOKING_SUBMIT_LIMIT || 8),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many booking requests from this network. Please try again later or email us." },
});
const quoteLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });

// Public
router.get("/catalog", publicCatalog);
router.post("/quote", quoteLimiter, quote);
router.post("/requests", submitLimiter, createBooking);
router.post("/requests/:reference/call", quoteLimiter, attachCall);

// Admin
router.get("/requests", userAuth, adminOnly, listBookings);
router.get("/requests/:id", userAuth, adminOnly, getBooking);
router.put("/requests/:id", userAuth, adminOnly, updateBooking);

export default router;
