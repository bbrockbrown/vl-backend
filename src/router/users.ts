import express from 'express';

import { deleteUser, getAllUsers, getCurrentUser, updateUser } from '../controllers/users';
import { isAuthenticated, isOwner } from '../middleware';

export default (router: express.Router) => {
  // User routes
  router.get('/users', isAuthenticated, getAllUsers);
  router.get('/users/me', isAuthenticated, getCurrentUser);
  router.delete('/users/:id', isAuthenticated, isOwner, deleteUser);
  router.patch('/users/:id', isAuthenticated, isOwner, updateUser);
}