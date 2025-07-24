import express from "express";

import authentication from "./authentication";
import users from "./users";
import lastfm from "./lastfm";
import spotify from "./spotify";
import stripe from "./stripe";

const router = express.Router();

export default(): express.Router => {
  authentication(router);
  users(router);
  lastfm(router);
  spotify(router);
  stripe(router);
  return router;
}