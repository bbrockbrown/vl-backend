import express from 'express';

import { deleteUser, getAllUsers, updateUser } from '../controllers/users';
import { isAuthenticated, isOwner } from '../middleware';
import { lastfmCallback } from '../controllers/lastfm';

export default (router: express.Router) => {
  // last.fm routes
  router.get('/lastfm/callback', lastfmCallback);
}