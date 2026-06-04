import jwt from "jsonwebtoken";
import { supabase } from "../supabase.js";

export const userAuth = async (
  req,
  res,
  next
) => {
  try {
    const token =
      req.cookies.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      

    let user = null;

    // MEMBER LOGIN
    if (
      decoded.type === "member"
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("members")
        .select("*")
        .eq(
          "member_id",
          decoded.member_id
        )
        .single();

      if (error || !data) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      user = {
        ...data,
        user_type: "member",
      };
    }

    // CLIENT LOGIN
    if (
      decoded.user_type === "client"
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("clients")
        .select("*")
        .eq(
          "client_id",
          decoded.client_id
        )
        .single();

      if (error || !data) {
        return res.status(404).json({
          success: false,
          message:
            "Client not found",
        });
      }

      user = {
        ...data,
        user_type: "client",
      };
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid token",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Invalid token",
    });
  }
};

export const adminOnly = (
  req,
  res,
  next
) => {
  if (
    req.user.user_type !==
    "member"
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  if (
    req.user.role !== "admin" &&
    req.user.role !==
      "superadmin"
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  next();
};

export const teamOnly = (
  req,
  res,
  next
) => {
  if (
    req.user.user_type !==
    "member"
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  next();
};

export const clientOnly = (
  req,
  res,
  next
) => {
  if (
    req.user.user_type !==
    "client"
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  next();
};



export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // find user
    const { data: user, error } = await supabase
      .from("members")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // password match
    if (user.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // generate jwt
    const token = jwt.sign(
  {
    type: "member",
    member_id: user.member_id,
  },
  process.env.JWT_SECRET
);

    // store cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // true in production
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",

      user: {
        member_id: user.member_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



export const clientLogin =
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Email and password are required",
        });
      }

      const {
        data: client,
        error,
      } = await supabase
        .from("clients")
        .select("*")
        .eq("email", email)
        .single();

      if (error || !client) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid credentials",
        });
      }

      if (
        client.password !==
        password
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid credentials",
        });
      }

      const token =
        jwt.sign(
          {
            client_id:
              client.client_id,

            user_type:
              "client",
          },
          process.env.JWT_SECRET,
          {
            expiresIn: "30d",
          }
        );

      res.cookie(
        "token",
        token,
        {
          httpOnly: true,
          secure: true,
          sameSite:
            "strict",
          maxAge:
            30 *
            24 *
            60 *
            60 *
            1000,
        }
      );

      return res.status(200).json({
        success: true,
        message:
          "Login successful",

        user: {
          client_id:
            client.client_id,

          client_name:
            client.client_name,

          email:
            client.email,

          user_type:
            "client",
        },
      });
    } catch (error) {
      console.error(
        "Client Login Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  };

  export const logout =
  async (req, res) => {
    try {
      res.clearCookie(
        "token",
        {
          httpOnly: true,
          secure:
            process.env
              .NODE_ENV ===
            "production",
          sameSite:
            "strict",
        }
      );

      return res.status(200).json({
        success: true,
        message:
          "Logged out successfully",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  };