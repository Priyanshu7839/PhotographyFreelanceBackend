import express from 'express'
import UploadRouter from './upload.routes.js';
import tests from './test.js';
import cors from 'cors'
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";


import clientRouter from './routes/Client.routes.js';
import loginRouter from './login.routes.js';
import projectRouter from './routes/ProjectDetails.routes.js';
import homepageRouter from './routes/Homepage.routes.js'

dotenv.config();



const app = express();

const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://photographyfreelance.vercel.app',
    'https://midorimediacompany.com',
    'www.midorimediacompany.com',
    'midorimediacompany.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};


app.use(cookieParser());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = 8002;

app.use('/upload',UploadRouter)
app.use('/client',clientRouter)
app.use('/auth',loginRouter)
app.use('/project',projectRouter)
app.use('/homepage',homepageRouter)

tests.testR2()
tests.testSupabase()

app.listen(PORT,()=>{
    console.log(`Server Started at port ${PORT}`);
})
