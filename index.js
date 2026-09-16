import express from 'express'
import UploadRouter from './upload.routes.js';
import tests from './test.js';
import cors from 'cors'
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";


import clientRouter from './routes/Client.routes.js';
import loginRouter from './login.routes.js';
import projectRouter from './routes/ProjectDetails.routes.js';
import homepageRouter from './routes/Homepage.routes.js'
import vendorRouter from './routes/Vendor.routes.js'

dotenv.config();



const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://photographyfreelance.vercel.app",
  "https://midorimediacompany.com",
  "https://www.midorimediacompany.com",
].join(","))
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};


app.use(cookieParser());
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many login attempts. Please try again later." } }));
app.use("/upload/sendenquiry", rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }));
const PORT = 8002;

app.use('/upload',UploadRouter)
app.use('/client',clientRouter)
app.use('/auth',loginRouter)
app.use('/project',projectRouter)
app.use('/homepage',homepageRouter)
app.use('/vendor', vendorRouter)

if (process.env.NODE_ENV !== "production" && process.env.RUN_STARTUP_DIAGNOSTICS === "true") {
  tests.testR2();
  tests.testSupabase();
}

app.listen(PORT,()=>{
    console.log(`Server Started at port ${PORT}`);
})
