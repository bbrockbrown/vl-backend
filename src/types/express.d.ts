import { UserModel } from '../db/users';
import { Document } from 'mongoose';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { SpotifyHelper } from '../helpers/spotifyHelpers';

export type UserDocument = Document & typeof UserModel.prototype;

declare global {
  namespace Express {
    interface Request {
      identity?: UserDocument;
    }
    interface Response {
      locals: {
        spotifyApi: SpotifyApi;
      };
    }
    interface Locals {
      spotifyApi: SpotifyApi | null;
      spotifyHelper: SpotifyHelper | null;
    }
  }
} 