import express from 'express';

import { createUser, getUserByEmail } from '../db/users';
import { authentication, random } from '../helpers';

export const login = async (req: express.Request, res: express.Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.sendStatus(400);
    }

    const user = await getUserByEmail(email).select('+authentication.salt +authentication.password');

    if (!user || !user?.authentication?.salt || !user?.authentication?.password) {
      return res.sendStatus(400);
    }

    const expectedHash = authentication(user.authentication.salt, password);

    if (user.authentication.password !== expectedHash) {
      return res.sendStatus(403);
    }

    const salt = random();
    user.authentication.sessionToken = authentication(salt, user._id.toString());

    await user.save();

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN!;
    res.cookie(process.env.COOKIE_NAME!, user.authentication.sessionToken, {
      domain: isProduction ? cookieDomain : 'localhost',  // where cookie is sent to
      path: '/',            // scope of cookie for security 
      httpOnly: true,       // do not allow JS to access cookie
      secure: isProduction, // will only send cookie if HTTPS (ONLY TRUE IN PROD)
      sameSite: 'strict',   // cookie is not sent with cross-site requests
    });

    return res.status(200).json(user).end();
  } catch (error) {
    console.error(error);
    res.sendStatus(400);
  }
};

export const register = async (req: express.Request, res: express.Response) => {
  try {
    // Get request vars
    const { email, password, username } = req.body;

    // Validate vars
    if (!email || !password || !username) {
      return res.sendStatus(400);
    }

    // Check for existing user (unique email)
    const existingUser = await getUserByEmail(email);

    // Error if existing 
    if (existingUser) {
      return res.sendStatus(400);
    }

    const salt = random();
    const user = await createUser({ // Create user
      email,
      username,
      authentication: {
        salt, // store so we can check password later
        password: authentication(salt, password),
      },
    });

    return res.status(200).json(user).end();
  } catch (error) {
    console.log(error);
    return res.sendStatus(400);
  }
};