import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Compression middleware - add early for maximum benefit
app.use(compression({
  level: 6, // Balance between speed and compression ratio
  threshold: 1024, // Only compress responses > 1KB
  filter: (req: any, res: any) => {
    // Compress JSON responses (API calls) and text content
    const contentType = res.getHeader('content-type');
    return compression.filter(req, res) || 
           (typeof contentType === 'string' && contentType.includes('application/json'));
  }
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "https://api.rectify.so", "*.rectify.so"], // Needed for Vite dev and Rectify widget
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://api.rectify.so", "*.rectify.so"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "https://api.rectify.so", "*.rectify.so"], // Allow HTTPS connections and Rectify API
      frameSrc: ["'self'", "https:", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://play.gumlet.io", "https://api.rectify.so", "*.rectify.so"],
      mediaSrc: ["'self'", "https:", "https://www.youtube.com", "https://play.gumlet.io"],
      fontSrc: ["'self'", "https:", "data:"],
      childSrc: ["'self'", "https:", "*.rectify.so"],
      workerSrc: ["'self'", "blob:", "https:", "*.rectify.so"],
    },
  },
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per windowMs
  message: {
    error: "Trop de requêtes depuis cette adresse IP, veuillez réessayer dans une minute."
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development', // Skip in dev
});

// More restrictive rate limiting for Flowise endpoint
const flowiseLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit to 10 chat messages per minute per IP
  message: {
    error: "Limite de messages atteinte. Attendez une minute avant de continuer la conversation."
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
});

app.use('/api', apiLimiter);
app.use('/api/flowise', flowiseLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Only log response for non-sensitive endpoints
      if (capturedJsonResponse && !path.includes('/flowise/')) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
