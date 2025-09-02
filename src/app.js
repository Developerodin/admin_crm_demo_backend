import express from 'express';
import helmet from 'helmet';
import xss  from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import cors from 'cors';
import passport from 'passport';
import httpStatus from 'http-status';
import config from './config/config.js';
import * as morgan from './config/morgan.js';
import { jwtStrategy } from './config/passport.js';
import { authLimiter } from './middlewares/rateLimiter.js';
import routes from './routes/v1/index.js';
import { errorConverter, errorHandler } from './middlewares/error.js';
import ApiError from './utils/ApiError.js';

const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// parse json request body with increased limits for bulk operations
app.use(express.json({ 
  limit: '50mb', // Increased from default 100kb to handle large bulk imports
  verify: (req, res, buf) => {
    // Store raw body for potential use
    req.rawBody = buf;
  }
}));

// parse urlencoded request body with increased limits
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' // Increased limit for form data
}));

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());

// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// Root route handler
app.get('/', (req, res) => {
  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Welcome to the API',
    version: '1.0.0'
  });
});

// v1 api routes
app.use('/v1', routes);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(config.env === 'development' && { stack: err.stack })
  });
});

export default app;

