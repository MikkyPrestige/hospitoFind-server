import crypto from "node:crypto";
import { Resend } from "resend";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import bcrypt from "bcrypt";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

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

  let user = await User.findOne({ email }).exec();

  if (user) {
    console.log(`🔗 Linking Auth0 login to existing account: ${email}`);

    if (!user.username) {
      user.username = username;
      await user.save();
    }
  } else {
    console.log(`✨ Creating new account for: ${email}`);
    const userEmail = email || `${username}_${Date.now()}@hospitofind.com`;
    user = await User.create({
      name,
      username: username || email.split("@")[0],
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
    domain: ".hospitofind.online",
  });

  res.status(200).json({
    accessToken,
    id: user._id,
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

  const user = await User.findOne({
    $or: [{ email: email }, { username: email }],
  }).exec();

  if (!user) {
    return res
      .status(401)
      .json({ message: "User not found. Please check your email or sign up." });
  }

  if (user && !user.password) {
    return res.status(400).json({
      message:
        "This account uses Social Login. Please sign in with Google/Facebook.",
    });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!user.isVerified) {
    return res.status(403).json({
      message:
        "Your email is not verified. Please check your inbox for the link.",
    });
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
    maxAge: 7 * 24 * 60 * 60 * 1000,
    domain: ".hospitofind.online",
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

// @desc Register new user & send verification email
// @route POST /auth/register
// @access  Public
export const register = asyncHandler(async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !password || !email) {
    return res.status(400).json({ message: "Please fill in all fields" });
  }

  const existingUser = await User.findOne({ email }).exec();

  if (existingUser) {
    if (!existingUser.isVerified) {
      return res.status(409).json({
        message:
          "This email is already registered but not verified. Please check your inbox or use the 'Resend Link' option.",
      });
    }
    return res.status(409).json({ message: "Email already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const verificationToken = crypto.randomBytes(32).toString("hex");

  const user = await User.create({
    name,
    username,
    email,
    password: hashedPassword,
    role: "user",
    isVerified: false,
    verificationToken,
    verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000,
  });

  if (user) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    try {
      await resend.emails.send({
        from: "HospitoFind <onboarding@hospitofind.online>",
        to: email,
        subject: "Verify your HospitoFind Account",
        html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e8f0; border-radius: 12px; padding: 40px;">
                        <h1 style="color: #0e3db7; text-align: center;">HospitoFind</h1>
                        <h2 style="text-align: center;">Welcome, ${name}!</h2>
                        <p style="text-align: center;">Please click the button below to verify your email address:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${verificationLink}"
                               style="background: #0e3db7; color: white; padding: 14px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                               Verify Email Address
                            </a>
                        </div>
                        <p style="font-size: 12px; color: #718096; text-align: center;">This link expires in 24 hours.</p>
                    </div>
                `,
      });
    } catch (emailError) {
      console.error("Resend Error:", emailError);
    }

    res.status(201).json({
      message:
        "Registration successful! Please check your email to verify your account.",
    });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
});

// const register = asyncHandler(async (req, res) => {
//   const { name, username, email, password } = req.body;

//   if (!name || !username || !password || !email) {
//     return res.status(400).json({ message: "Please fill in all fields" });
//   }

//   const duplicate = await User.findOne({ username }).lean().exec();
//   if (duplicate) return res.status(409).json({ message: "Username taken" });

//   const hashedPassword = await bcrypt.hash(password, 10);

//   const user = await User.create({
//     name,
//     username,
//     email,
//     password: hashedPassword,
//     role: "user",
//   });

//   if (user) {
//     // Generate tokens exactly like login
//     const accessToken = jwt.sign(
//       { UserInfo: { id: user._id, username: user.username, role: user.role } },
//       process.env.ACCESS_TOKEN_SECRET,
//       { expiresIn: "15m" }
//     );

//     const refreshToken = jwt.sign(
//       { username: user.username },
//       process.env.REFRESH_TOKEN_SECRET,
//       { expiresIn: "7d" }
//     );

//     res.cookie("jwt", refreshToken, {
//       httpOnly: true,
//       secure: true,
//       sameSite: "None",
//       maxAge: 7 * 24 * 60 * 60 * 1000,
//     });

//     res.status(201).json({
//       accessToken,
//       name: user.name,
//       username: user.username,
//       email: user.email,
//       role: user.role,
//     });
//   } else {
//     res.status(400).json({ message: "Invalid user data" });
//   }
// });

// Verify Email
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).json({ message: "Token is required" });

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res
      .status(400)
      .json({ message: "Invalid or expired verification link" });
  }

  // Activate User
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();

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
    secure: true,
    sameSite: "None",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    domain: ".hospitofind.online",
  });

  res.status(200).json({
    message: "Email verified successfully!",
    accessToken,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
  });
});

const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(200).json({
      message:
        "If an account exists with this email, a new link has been sent.",
    });
  }

  if (user.isVerified) {
    return res.status(400).json({
      message: "This account is already verified. Please log in.",
    });
  }

  // Only allow resend if the last token was created more than 2 minutes ago
  const now = new Date();
  if (
    user.verificationTokenExpires &&
    user.verificationTokenExpires - now > 23 * 60 * 60 * 1000 + 58 * 60 * 1000
  ) {
    return res.status(429).json({
      message: "Please wait a few minutes before requesting another link.",
    });
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  user.verificationToken = verificationToken;
  user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save();

  const resend = new Resend(process.env.RESEND_API_KEY);
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  try {
    await resend.emails.send({
      from: "HospitoFind <onboarding@hospitofind.online>",
      to: email,
      subject: "Verify your email - HospitoFind",
      html: `
                <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e8f0; border-radius: 16px; padding: 40px; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h1 style="color: #0e3db7; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">HospitoFind</h1>
                    </div>

                    <div style="text-align: center; margin-bottom: 32px;">
                        <h2 style="color: #1a202c; font-size: 22px; font-weight: 700; margin-bottom: 12px;">Confirm your email address</h2>
                        <p style="color: #4a5568; line-height: 1.6; font-size: 16px; margin: 0;">
                            Tap the button below to confirm your email address and activate your account. This helps us keep your healthcare search secure.
                        </p>
                    </div>

                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${verificationLink}"
                           style="background-color: #0e3db7; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(14, 61, 183, 0.25);">
                           Verify Email Address
                        </a>
                    </div>

                    <p style="color: #718096; font-size: 14px; text-align: center; margin-top: 32px; line-height: 1.5;">
                        If you didn't request this email, you can safely ignore it. This link will expire in 24 hours.
                    </p>

                    <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 32px 0;" />

                    <p style="color: #a0aec0; font-size: 12px; text-align: center; margin: 0;">
                        &copy; ${new Date().getFullYear()} HospitoFind. All rights reserved.
                    </p>
                </div>
            `,
    });

    res
      .status(200)
      .json({ message: "Verification email sent! Check your inbox." });
  } catch (error) {
    console.error("Resend Error:", error);
    res
      .status(500)
      .json({ message: "Failed to send email. Please try again later." });
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

      const user = await User.findOne({ username: decoded.username });

      if (!user)
        return res.status(401).json({ message: "User no longer exists" });

      // Create a NEW Access Token
      const accessToken = jwt.sign(
        {
          UserInfo: {
            username: user.username,
            role: user.role,
            id: user._id,
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
        id: user._id,
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
  verifyEmail,
  resendVerification,
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
