import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import compression from "compression";
import router from './router';

dotenv.config();

// Import routes & middleware
// const authRoutes = require("./routes/authRoutes");
// const generalRoutes = require("./routes/generalRoutes");
// const userRoutes = require("./routes/therapistRoutes");
// const adminRoutes = require("./routes/adminRoutes");

const app = express();


const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL_DEV,
    ];
    console.log("Request origin", origin);
    console.log("Allowed origins", allowedOrigins);

    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(compression());
app.use(bodyParser.json());

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("ERROR DETAILS", {
    message: err.message,
    stack: err.stack,
    status: err.status || 500,
  });

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message,
  });
});

app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, "/");
  next();
});

// app.use("/auth", authRoutes);
// app.use("/", generalRoutes);
// app.use("/user", userRoutes);
// app.use("/admin", adminRoutes);

app.get('/', (_req, res) => {
  console.log("RECEIVED GET /");
  res.send({
    message: 'working'
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK "});
})

if (process.env.NODE_ENV !== "production") {
  console.log("CORS CONFIGURATION:", {
    origin: process.env.FRONTEND_URL,
    allowedOrigins: [process.env.FRONTEND_URL, process.env.FRONTEND_URL_DEV],
    credentials: true,
  });
}

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`SERVER LISTENING ON PORT ${PORT}`);
  console.log(`SERVER ENVIRONMENT: ${process.env.NODE_ENV || "development"}`);
  console.log(`FRONTEND URL: ${process.env.FRONTEND_URL}`);
});

mongoose.Promise = Promise;
mongoose.connect(process.env.MONGO_URL!);
mongoose.connection.on('error', (error: Error) => console.log(error));
mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB successfully!');
});

app.use('/', router());