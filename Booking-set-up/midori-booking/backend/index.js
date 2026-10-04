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
import bookingRouter from './booking/booking.routes.js'
import { stripSecrets } from './middleware/stripSecrets.js'

dotenv.config();



const app = express();
// Render (and most hosts) sit behind one proxy: use the real client IP for rate limits.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.disable('x-powered-by');

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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};


app.use(cookieParser());
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(stripSecrets);
app.use(["/auth/login", "/auth/client/login"], rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many login attempts. Please try again later." } }));
app.use("/upload/sendenquiry", rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }));
const PORT = process.env.PORT || 8002;

app.use('/upload',UploadRouter)
app.use('/client',clientRouter)
app.use('/auth',loginRouter)
app.use('/project',projectRouter)
app.use('/homepage',homepageRouter)
app.use('/vendor', vendorRouter)
app.use('/booking', bookingRouter)

// JSON 404 and error handler (instead of Express HTML pages)
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use((err, req, res, next) => {
  if (err?.message === 'Origin not allowed by CORS') return res.status(403).json({ success: false, message: 'Origin not allowed' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request too large' });
  console.error(err);
  return res.status(500).json({ success: false, message: 'Something went wrong' });
});

if (process.env.NODE_ENV !== "production" && process.env.RUN_STARTUP_DIAGNOSTICS === "true") {
  tests.testR2();
  tests.testSupabase();
}

app.listen(PORT,()=>{
    console.log(`Server Started at port ${PORT}`);
})
