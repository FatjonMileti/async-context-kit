import express from "express";
import { RequestContext } from "async-context-kit";

const app = express();

app.use(
  RequestContext.middleware({
    requestId: { header: "x-request-id", generate: true, responseHeader: true },
  }),
);

// Example: derive extra context after authentication.
app.use((req, _res, next) => {
  const userId = req.headers["x-user-id"];
  if (typeof userId === "string" && userId.length > 0) {
    RequestContext.setValue("userId", userId);
  }
  next();
});

async function getUsers() {
  const context = RequestContext.get();
  // Available here without passing it as an argument:
  console.log("getUsers, requestId =", context?.requestId);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return [{ id: 1, name: "Ada" }];
}

app.get("/users", async (_req, res) => {
  const users = await getUsers();
  res.json(users);
});

app.get("/me", (_req, res) => {
  res.json(RequestContext.get() ?? null);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`example app listening on http://localhost:${port}`);
});
