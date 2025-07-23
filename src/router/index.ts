import express from "express";

import authentication from "./authentication";
import users from "./users";
import lastfm from "./lastfm";

const router = express.Router();

export default(): express.Router => {
  authentication(router);
  users(router);
  lastfm(router);
  return router;
}