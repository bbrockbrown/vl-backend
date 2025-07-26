import express from 'express';

import { deleteUserById, getUserById, getUsers, getUserBySessionToken } from '../db/users';

export const getAllUsers = async (req: express.Request, res: express.Response) => {
  try {
    const users = await getUsers();

    return res.status(200).json(users).end();
  } catch (error) {
    console.log(error);
    return res.sendStatus(400);
  }
};

export const deleteUser = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;

    const deletedUser = await deleteUserById(id);

    return res.status(200).json(deletedUser).end();
  } catch (error) {
    console.log(error);
    return res.sendStatus(400);
  }
};

export const updateUser = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.sendStatus(400);
    }
    
    const user = await getUserById(id);

    if (!user) {
      return res.sendStatus(400);
    }

    user.username = username;
    await user?.save();

    return res.status(200).json(user).end();
  } catch (error) {
    console.log(error);
    return res.sendStatus(400);
  }
}

export const getCurrentUser = async (req: express.Request, res: express.Response) => {
  try {
    // Get user ID from session or authentication middleware
    const sessionToken = req.session?.sessionToken;
    
    if (!sessionToken) {
      return res.status(401).json({ 
        error: 'User not authenticated' 
      });
    }

    // Find the user by session token
    const user = await getUserBySessionToken(sessionToken);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // Return user
    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(400).json({ 
      error: 'Could not fetch current user' 
    });
  }
};
