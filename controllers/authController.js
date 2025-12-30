import User from "../models/userModel.js";
import bcrypt from "bcrypt";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

// @desc Auth0 login callback
// @route GET /auth/callback
// @access Public
const auth0Login = asyncHandler(async (req, res) => {
  const { email, name, username, idToken } = req.body;

  const client = new JwksClient({
    jwksUri: process.env.JWKSURI,
    cache: true,
  });

  const decodedToken = jwt.decode(idToken, { complete: true });

  if (!decodedToken || !decodedToken.header || !decodedToken.header.kid) {
    return res
      .status(400)
      .json({ message: "Unable to retrieve key ID from token" });
  }

  const getKey = (header, callback) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
      } else {
        const signingKey = key.getPublicKey || key.rsaPublicKey;
        callback(null, signingKey);
      }
    });
  };

  // Verify the token
  await new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        algorithms: ["RS256"],
        audience: process.env.AUTH0_AUDIENCE,
        issuer: process.env.AUTH0_ISSUER,
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      }
    );
  });

  if (decodedToken.payload.email !== email) {
    return res.status(400).json({ message: "Email mismatch" });
  }

  let user = await User.findOne({ username }).exec();

  if (!user) {
    const userEmail = email || `${username}_${Date.now()}@hospitofind.com`;
    user = await User.create({
      name,
      username,
      email: userEmail,
      role: "user",
    });
  }

  // Create access token with role
  const accessToken = jwt.sign(
    {
      UserInfo: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { username: user.username },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("jwt", refreshToken, {
    httpOnly: true,
    sameSite: "None",
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

// @desc Login
// @route POST /auth
// @access Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Please fill in all fields" });
  }

  const user = await User.findOne({ email }).exec();

  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Create access token
  const accessToken = jwt.sign(
    {
      UserInfo: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );

  // Create refresh token
  const refreshToken = jwt.sign(
    { username: user.username },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("jwt", refreshToken, {
    httpOnly: true,
    sameSite: "None",
    secure: true,
    // path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

// @desc Register new user
// @route POST /auth/register
const register = asyncHandler(async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !password || !email) {
    return res.status(400).json({ message: "Please fill in all fields" });
  }

  const duplicate = await User.findOne({ username }).lean().exec();
  if (duplicate) return res.status(409).json({ message: "Username taken" });

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name, username, email,
    password: hashedPassword,
    role: "user"
  });

  if (user) {
    // Generate tokens exactly like login
    const accessToken = jwt.sign(
      { UserInfo: { id: user._id, username: user.username, role: user.role } },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { username: user.username },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("jwt", refreshToken, {
      httpOnly: true, secure: true, sameSite: "None", maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      accessToken,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
});

// @desc Refresh token
// @route GET /auth/refresh
// @access Public
const refresh = asyncHandler(async (req, res) => {
  const cookies = req.cookies;

  if (!cookies?.jwt)
    return res.status(401).json({ message: "No refresh token" });

  const refreshToken = cookies.jwt;

  jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET,
    async (err, decoded) => {
      if (err)
        return res
          .status(403)
          .json({ message: "Forbidden: Token Expired or Invalid" });

      const user = await User.findOne({ username: decoded.username }).exec();

      if (!user)
        return res.status(401).json({ message: "User no longer exists" });

      // Create a NEW Access Token
      const accessToken = jwt.sign(
        {
          UserInfo: {
            username: user.username,
            role: user.role,
          },
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );

      res.json({
        accessToken,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    }
  );
});

// @desc Logout
// @route POST /auth/logout
// @access Private
const logout = asyncHandler(async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(204);

  // Clear the cookie
  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });

  res.status(200).json({ message: "Cookie cleared" });
});

export default {
  auth0Login,
  login,
register,
  refresh,
  logout,
};

// import User from "../models/userModel.js";
// import bcrypt from "bcrypt";
// import asyncHandler from "express-async-handler";
// import jwt from "jsonwebtoken";
// import { JwksClient } from "jwks-rsa";

// // @desc Auth0 login callback
// // @route GET /auth/callback
// // @access Public
// const auth0Login = asyncHandler(async (req, res) => {
//   const { email, name, username, idToken } = req.body;

//   const client = new JwksClient({
//     jwksUri: process.env.JWKSURI,
//     cache: true,
//     // rateLimit: true
//   })

//   // Decode the token to get the kid (key ID)
//   const decodedToken = jwt.decode(idToken, { complete: true });

//   if (!decodedToken || !decodedToken.header || !decodedToken.header.kid) {
//     return res.status(400).json({ message: "Unable to retrieve key ID from token" })
//   }

//   // Get the public key based on the kid
//   const getKey = (header, callback) => {
//     client.getSigningKey(header.kid, (err, key) => {
//       if (err) {
//         callback(err);
//       } else {
//         const signingKey = key.getPublicKey || key.rsaPublicKey;
//         callback(null, signingKey);
//       }
//     });
//   };

//   // Verify the token using the public key asynchronously
//   await new Promise((resolve, reject) => {
//     jwt.verify(idToken, getKey, {
//       algorithms: ['RS256'],
//       audience: process.env.AUTH0_AUDIENCE,
//       issuer: process.env.AUTH0_ISSUER,
//     }, (err, decoded) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(decoded);
//       }
//     });
//   });

//   // Check if the email in the decoded token matches the email from the request
//   if (decodedToken.payload.email !== email) {
//     return res.status(400).json({ message: "Email mismatch" })
//   }

//   // Check if the user exists
//   let user = await User.findOne({ username }).exec();
//   if (!user) {
//     // Check if the email is available in the request, otherwise use a placeholder
//     const userEmail = email || `${username}_${Date.now()}@hospitofind.com`;
//     user = await User.create({
//       name,
//       username,
//       email: userEmail,
//     });
//   }

//   // create tokens
//   const accessToken = jwt.sign({ username: user.username }, process.env.ACCESS_TOKEN_SECRET, {
//     expiresIn: '30m',
//   });

//   res.cookie("jwt", accessToken, { httpOnly: true, sameSite: "none", secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

//   res.status(200).json({
//     accessToken,
//     name: user.name,
//     username: user.username,
//     email: user.email
//   });
// })

// // @desc Login
// // @route POST /auth
// // @access Public
// const login = asyncHandler(async (req, res) => {
//   const { email, password } = req.body
//   // confirm data
//   if (!email) {
//     return res.status(400).json({ message: "Please fill in email" })
//   } else if (!password) {
//     return res.status(400).json({ message: "Please fill in password" })
//   }

//   const user = await User.findOne({ email }).exec()
//   if (!user) {
//     return res.status(404).json({ message: "User not found" })
//   }

//   const match = await bcrypt.compare(password, user.password)
//   if (!match) {
//     return res.status(401).json({ message: "Invalid credentials" })
//   }

//   // create tokens
//   const accessToken = jwt.sign({ "email": user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" })
//   const refreshToken = jwt.sign({ "email": user.email }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" })

//   res.cookie("jwt", refreshToken, { httpOnly: true, sameSite: "none", secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 })

//   res.status(201).json({
//     accessToken,
//     name: user.name,
//     username: user.username,
//     email: user.email,
//   })
// })

// // @desc Refresh token
// // @route GET /auth/refresh
// // @access Public
// const refresh = asyncHandler(async (req, res) => {
//   const cookies = req.cookies

//   if (!cookies?.jwt) return res.status(401).json({ message: "No refresh token" })

//   const refreshToken = cookies.jwt

//   jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
//     if (err) {
//       return res.status(403).json({ message: "forbidden" })
//     }

//     const user = await User.findOne({ email: decoded.email }).exec()
//     if (!user) {
//       return res.status(404).json({ message: "unauthorized" })
//     }

//     const accessToken = jwt.sign({ "email": user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" })
//     res.json({ accessToken })
//   })
// })

// // @desc Logout
// // @route POST /auth/logout
// // @access Private
// const logout = asyncHandler(async (req, res) => {
//   const cookies = req.cookies
//   if (!cookies?.jwt) return res.sendStatus(200)

//   res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true }).json({ message: 'Cookie cleared' })
//   res.status(201).json({ message: "Logged out" })
// })

// export default {
//   auth0Login,
//   login,
//   refresh,
//   logout
// }
