import express from "express";
import { clientLogin, login, logout } from "./middleware/auth.js";


const loginRouter = express.Router();

loginRouter.post(
  "/login",login
  
);

loginRouter.post(
  "/client/login",
  clientLogin
);

loginRouter.post(
  "/logout",
  logout
);
export default loginRouter;