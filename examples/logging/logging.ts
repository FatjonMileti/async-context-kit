import { RequestContext } from "async-context-kit";

/** Minimal helper: pick the log fields you want from the context. */
export function getLogContext() {
  const context = RequestContext.get();
  return {
    requestId: context?.requestId,
    userId: context?.userId,
    tenantId: context?.tenantId,
  };
}

// --- console ---
console.log("request completed", getLogContext());

// --- Pino ---
// import pino from "pino";
// const logger = pino();
// app.use(RequestContext.middleware());
// // Per-request child logger (e.g. in a route or service):
// const reqLogger = logger.child(getLogContext());
// reqLogger.info("request completed");
//
// // Or use pino's mixin option to attach context to every line:
// // const logger = pino({ mixin: () => getLogContext() });
//
// --- Winston ---
// import winston from "winston";
// const logger = winston.createLogger({
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.json(),
//   ),
//   transports: [new winston.transports.Console()],
// });
// logger.info("request completed", getLogContext());
