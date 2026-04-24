import jwt from "jsonwebtoken";
import { supabase } from "../supabase";


const userAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res
      .status(401)
      .json({ message: "Unauthorized, no token provided!" });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY); 
    console.log("Decoded token:", decoded); 

    const user = await supabase.from("clients").select("*").eq("id", decoded.id);
    console.log(user);
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    req.user = user; 
    next(); 
  } catch (error) {
    console.error("Authentication error:", error); 
    return res.status(401).json({ message: "Unauthorized, token is invalid!" });
  }
};

export default userAuth;
