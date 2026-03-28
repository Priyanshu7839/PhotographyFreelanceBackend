import express from 'express'
import UploadRouter from './upload.routes.js';
import tests from './test.js';
import cors from 'cors'



const app = express();

const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = 8002;

app.use('/upload',UploadRouter)

tests.testR2()
tests.testSupabase()

app.listen(PORT,()=>{
    console.log(`Server Started at port ${PORT}`);
})
