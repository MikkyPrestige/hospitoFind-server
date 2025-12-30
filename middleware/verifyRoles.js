import jwt from "jsonwebtoken";

export const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .json({ message: "Forbidden: Invalid or Expired token" });
    }

    req.user = decoded.UserInfo.username;
    req.role = decoded.UserInfo.role;
    req.userId = decoded.UserInfo.id;
    next();
  });
};

export const verifyAdmin = (req, res, next) => {
  // Check if the role attached by verifyJWT is 'admin'
  if (!req.role || req.role !== "admin") {
    return res.status(403).json({ message: "Access Denied: Admins Only" });
  }
  next();
};
