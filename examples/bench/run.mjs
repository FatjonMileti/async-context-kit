// Tiny, unscientific throughput probe for context overhead.
// Run: npm run bench (after npm run build)
import { RequestContext } from "../dist/index.js";

const iterations = 200_000;

// Baseline: plain function calls.
let sink = 0;
const t0 = performance.now();
for (let i = 0; i < iterations; i++) {
  sink += i;
}
const baselineMs = performance.now() - t0;

// With RequestContext.run + get per iteration.
const t1 = performance.now();
for (let i = 0; i < iterations; i++) {
  RequestContext.run({ requestId: "bench", n: i }, () => {
    sink += RequestContext.getValue("n");
  });
}
const withContextMs = performance.now() - t1;

console.log(`baseline:      ${baselineMs.toFixed(1)} ms`);
console.log(`with context:  ${withContextMs.toFixed(1)} ms`);
console.log(
  `overhead:      ${((withContextMs - baselineMs) / iterations).toFixed(4)} ms/iter (sink=${sink})`,
);
