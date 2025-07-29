import express, { NextFunction } from 'express';
import { get, merge } from 'lodash';

import { getUserBySessionToken } from '../db/users';

export const isOwner = async (req: express.Request, res: express.Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const currentUserId = get(req, 'identity._id') as string | undefined;

    if (!currentUserId) {
      return res.sendStatus(403);
    }

    if (currentUserId.toString() !== id) {
      return res.sendStatus(403);
    }

    next();
  } catch (error) {

  }
}

export const isAuthenticated = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // console.log("In isAuthenticated")
    // console.log("Request body", req.body);
    // console.log("Request hea", req.header);
    // console.log("All cookies:", req.cookies);
    // console.log("Cookie name:", process.env.COOKIE_NAME);
    // console.log("Authorization header:", req.headers.authorization);
    
    // Try to get session token from cookies first
    let sessionToken = req.cookies[process.env.COOKIE_NAME!];
    
    // If not in cookies, try Authorization header (for development)
    if (!sessionToken && req.headers.authorization) {
      // console.log("Session Token not found in req.cookies, setting from req.headers.authorization");
      sessionToken = req.headers.authorization.replace('Bearer ', '');
    }
    
    // console.log("sessionToken", sessionToken);

    if (!sessionToken) {
      return res.status(403).json({ error: "User is not authenticated" });
    }

    const existingUser = await getUserBySessionToken(sessionToken);

    if (!existingUser) {
      return res.status(403).json({ error: "User is not authenticated or does not exist" });
    }

    merge(req, { identity: existingUser });

    return next();
  } catch (error) {
    console.log("Error in authentication", error);
    return res.sendStatus(400);
  }
}