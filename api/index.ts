/**
 * Vercel Serverless entry-point — re-exports the Express app.
 *
 * Vercel detects the default export as a Node.js HTTP handler and wraps it
 * in a serverless function automatically.
 */
import app from '../src/app';

export default app;
