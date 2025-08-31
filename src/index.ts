import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import compression from 'compression';
import router from './router';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { spotifyPollingService } from './services/spotifyPollingService';

dotenv.config();

const app = express();

// Control what origins are allowed
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [process.env.FRONTEND_URL, process.env.FRONTEND_URL_DEV];
    console.log('Request origin', origin);
    console.log('Allowed origins', allowedOrigins);

    if (
      allowedOrigins.includes(origin) ||
      !origin ||
      origin?.includes('localhost') ||
      origin?.includes('127.0.0.1')
    ) {
      // !origin ==> curl http://localhost:5050...
      callback(null, true); // allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // deny
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
};

// Configurations
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compression());

// JSON parsing middleware - exclude webhook routes
app.use((req, res, next) => {
  if (req.path === '/stripe/webhook') {
    // Skip JSON parsing for webhook routes
    next();
  } else {
    // Parse JSON for all other routes
    express.json()(req, res, next);
  }
});

// Legacy bodyParser for backward compatibility
app.use((req, res, next) => {
  if (req.path === '/stripe/webhook') {
    // Skip body parsing for webhook routes
    next();
  } else {
    // Parse JSON for all other routes
    bodyParser.json()(req, res, next);
  }
});

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL!,
      touchAfter: 24 * 3600 // lazy session update
    }),
    cookie: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 5 * 24 * 60 * 60 * 1000, // 5 days
    },
  })
);

// Error handling middleware will be added after routes

// URL and slash management
// EX: URL//users///8494583854 ==> URL/users/8494583854
app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, '/');
  next();
});

// Check to see if working
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK #working' });
});


if (process.env.NODE_ENV !== 'production') {
  console.log('CORS CONFIGURATION:', {
    origin: process.env.FRONTEND_URL,
    allowedOrigins: [process.env.FRONTEND_URL, process.env.FRONTEND_URL_DEV],
    credentials: true,
  });
}

// PORT config
const PORT = process.env.PORT || 5050;
const server = app.listen(PORT, () => {
  console.log(`SERVER LISTENING ON PORT ${PORT}`);
  console.log(`SERVER ENVIRONMENT: ${process.env.NODE_ENV || 'development'}`);
  console.log(`FRONTEND URL: ${process.env.FRONTEND_URL}`);
});

// MongoDB Atlas config using mongoose
mongoose.Promise = Promise;

// Check if MONGO_URL is set
if (!process.env.MONGO_URL) {
  console.error('MONGO_URL environment variable is not set');
  process.exit(1);
}

// TODO ==> figure out ssl issue with railway + mongoDB.
mongoose.connect(process.env.MONGO_URL, {
  retryWrites: true,
  w: 'majority',
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

mongoose.connection.on('error', (error: Error) => console.log(error));
mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB successfully!');
  
  // Start the Spotify polling service after a short delay to ensure everything is ready
  setTimeout(() => {
    spotifyPollingService.startPolling().catch(error => {
      console.error('Failed to start Spotify polling service:', error);
      // Don't exit on polling service failure - just log it
    });
  }, 2000); // 2 second delay
});

const appRouter = router();
app.use('/', appRouter);

// Runs whenever there is an error - MUST be after all routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('ERROR DETAILS', {
    message: err.message,
    stack: err.stack,
    status: err.status || 500,
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
});

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Give time for logging then exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit for unhandled rejections, just log them
});

// Graceful shutdown handling with timeout
const gracefulShutdown = (signal: string) => {
  console.log(`${signal} signal received: starting graceful shutdown`);
  
  // Set a timeout to force exit if graceful shutdown takes too long
  const shutdownTimeout = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000); // 10 seconds timeout

  // Stop the polling service first
  Promise.all([
    spotifyPollingService.stopPolling().catch(error => {
      console.error('Error stopping polling service:', error);
    }),
    new Promise<void>((resolve) => {
      server.close((err) => {
        if (err) {
          console.error('Error closing HTTP server:', err);
        } else {
          console.log('HTTP server closed');
        }
        resolve();
      });
    }),
    mongoose.connection.close().catch(error => {
      console.error('Error closing MongoDB connection:', error);
    })
  ]).then(() => {
    console.log('Graceful shutdown completed');
    clearTimeout(shutdownTimeout);
    process.exit(0);
  }).catch((error) => {
    console.error('Error during graceful shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
