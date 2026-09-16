import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { supabase } from "../supabase.js";

const isProduction = process.env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
};

const publicUserFields = "member_id, full_name, email, role";
const publicClientFields = "client_id, client_name, email, event_name, event_date, event_location";

export const userAuth = async (
  req,
  res,
  next
) => {
  try {
    const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
    const token = req.cookies.token || bearer;

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
        .select(publicUserFields)
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
        .select(publicClientFields)
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

/**
 * Ensures a client can see only its own project and a team member can see
 * only a project to which they have been assigned. Admins keep full access.
 */
export const requireClientAccess = (paramName = "clientId") => async (req, res, next) => {
  const clientId = req.params[paramName] ?? req.params.client_id ?? req.body?.client_id ?? req.body?.clientId;
  if (!clientId) return res.status(400).json({ success: false, message: "Client id is required" });

  if (req.user.user_type === "client") {
    if (String(req.user.client_id) !== String(clientId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    return next();
  }

  if (req.user.role === "admin" || req.user.role === "superadmin") return next();

  const { data, error } = await supabase
    .from("project_steps")
    .select("project_step_id")
    .eq("client_id", clientId)
    .contains("assigned_member_ids", [req.user.member_id])
    .limit(1);

  if (error) return res.status(500).json({ success: false, message: "Unable to verify project access" });
  if (!data?.length) return res.status(403).json({ success: false, message: "Access denied" });
  return next();
};

export const requireProjectStepAccess = async (req, res, next) => {
  const stepId = req.params.project_step_id || req.params.step_id;
  const { data: step, error } = await supabase
    .from("project_steps")
    .select("client_id, assigned_member_ids")
    .eq("project_step_id", stepId)
    .single();
  if (error || !step) return res.status(404).json({ success: false, message: "Project step not found" });
  req.params.clientId = step.client_id;
  return requireClientAccess("clientId")(req, res, next);
};

export const requireFileAccess = async (req, res, next) => {
  const fileId = req.params.fileId ?? req.body?.fileId;
  const { data: file, error } = await supabase.from("files").select("client_id").eq("file_id", fileId).single();
  if (error || !file) return res.status(404).json({ success: false, message: "File not found" });
  req.params.clientId = file.client_id;
  return requireClientAccess("clientId")(req, res, next);
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
      .select("member_id, full_name, email, role, password_hash")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // password match
    const isHash = user.password_hash?.startsWith("$2");
    const passwordMatches = isHash
      ? await bcrypt.compare(password, user.password_hash)
      : password === user.password_hash;
    if (!passwordMatches) {
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
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

    // Transparently upgrade existing plaintext records after a successful login.
    if (!isHash) {
      await supabase.from("members").update({ password_hash: await bcrypt.hash(password, 12) }).eq("member_id", user.member_id);
    }

    // store cookie
    res.cookie("token", token, {
      ...cookieOptions,
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
        .select("client_id, client_name, email, password")
        .eq("email", email)
        .single();

      if (error || !client) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid credentials",
        });
      }

      const isHash = client.password?.startsWith("$2");
      const passwordMatches = isHash
        ? await bcrypt.compare(password, client.password)
        : client.password === password;
      if (!passwordMatches) {
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

      if (!isHash) {
        await supabase.from("clients").update({ password: await bcrypt.hash(password, 12) }).eq("client_id", client.client_id);
      }

      res.cookie(
        "token",
        token,
        {
          ...cookieOptions,
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
          ...cookieOptions,
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
