import express from "express";

import users from "./users";
import lastfm from "./lastfm";
import spotify from "./spotify";
import stripe from "./stripe";
import quiz from "./quiz";
import analytics from "./analytics";

const router = express.Router();

export default(): express.Router => {
  users(router);
  lastfm(router);
  spotify(router); // using spotify OAuth for user verification and sign up
  stripe(router);
  quiz(router); // quiz analysis and personality test
  analytics(router); // analytics and dashboard data
  return router;
}