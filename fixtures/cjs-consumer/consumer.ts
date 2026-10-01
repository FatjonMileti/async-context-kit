// CJS consumer check: a static `import` in a CommonJS module compiled
// with `module: node16`. Before the conditional `types` in the exports
// map, this failed with TS1479 (types resolved to the ESM `.d.ts`
// while `require()` loads the CJS bundle at runtime).
import { RequestContext } from "async-context-kit";

export function handleRequestId(requestId: string): string | undefined {
  return RequestContext.run({ requestId }, () => {
    const active = RequestContext.get();
    RequestContext.setValue("handledBy", "cjs-consumer");
    return active?.requestId;
  });
}

export function outsideRequest(): boolean {
  return RequestContext.has();
}
