require("dotenv").config();
const express = require("express");
const loggingMiddleware = require("./src/middleware/logging");
const { Log } = require("./src/middleware/logging");

const app = express();

app.use(express.json());

app.use(loggingMiddleware);

app.get("/", async (req, res) => {
  await Log("backend", "info", "controller", "Health check passed - server is reachable and responding on GET ");
  res.send("Working");
});

app.use((req, res) => {
  res.status(404).send("Route not found");
});

app.listen(8000, () => console.log("Server running on port 8000"));