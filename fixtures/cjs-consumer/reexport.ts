// Declaration-emit check: re-exporting the middleware's inferred return
// type requires every referenced type to be publicly nameable. Before
// the `ExpressLike*` types were exported from the package root, this
// failed with TS4023 ("has or is using private name ...").
import { RequestContext } from "async-context-kit";

export const requestContextMiddleware = RequestContext.middleware({
  requestId: { header: "x-request-id", generate: true, responseHeader: true },
});
