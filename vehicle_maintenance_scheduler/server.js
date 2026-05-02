require("dotenv").config({ path: require("path").resolve(__dirname, "../.env"), quiet: true });
const express = require("express");
const axios = require("axios");
const loggingMiddleware = require("../src/middleware/logging");
const { Log } = require("../src/middleware/logging");

const app = express();
app.use(express.json());
app.use(loggingMiddleware);

const BASE_URL = process.env["BASE-URL"];

let cachedToken = process.env.ACCESS_TOKEN;
let tokenFetchedAt = Date.now();
const TOKEN_TTL_MS = 14 * 60 * 1000;

async function getToken() {
  if (!cachedToken || Date.now() - tokenFetchedAt > TOKEN_TTL_MS) {
    await Log("backend", "info", "auth", "Access token expired — requesting a fresh token");
    const res = await axios.post(`${BASE_URL}/auth`, {
      email: "ap9748@srmist.edu.in",
      name: "Anubhav Parashar",
      mobileNo: "9135580071",
      githubUsername: "AnubhavScripts",
      rollNo: "RA2311003030535",
      accessCode: "QkbpxH",
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
    });
    cachedToken = res.data.access_token;
    tokenFetchedAt = Date.now();
    await Log("backend", "info", "auth", "New access token obtained successfully");
  }
  return cachedToken;
}

const getAuthHeaders = async () => ({
  Authorization: `Bearer ${await getToken()}`,
});

function knapsack(tasks, capacity) {
  const n = tasks.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = tasks[i - 1];
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (Duration <= w) {
        const withTask = dp[i - 1][w - Duration] + Impact;
        if (withTask > dp[i][w]) dp[i][w] = withTask;
      }
    }
  }

  const selectedTasks = [];
  let remaining = capacity;
  for (let i = n; i > 0; i--) {
    if (dp[i][remaining] !== dp[i - 1][remaining]) {
      selectedTasks.push(tasks[i - 1]);
      remaining -= tasks[i - 1].Duration;
    }
  }

  return {
    maxImpact: dp[n][capacity],
    selectedTasks,
    usedHours: capacity - remaining,
  };
}

app.get("/schedule", async (req, res) => {
  try {
    await Log("backend", "info", "controller", "Vehicle maintenance scheduling request received — fetching depot and vehicle data");

    const headers = await getAuthHeaders();

    const [depotsRes, vehiclesRes] = await Promise.all([
      axios.get(`${BASE_URL}/depots`, { headers }),
      axios.get(`${BASE_URL}/vehicles`, { headers }),
    ]);

    const depots = depotsRes.data.depots;
    const vehicles = vehiclesRes.data.vehicles;

    await Log("backend", "info", "repository", `Fetched ${depots.length} depots and ${vehicles.length} vehicles from evaluation service`);

    const totalMechanicHours = depots.reduce((sum, d) => sum + d.MechanicHours, 0);

    await Log("backend", "info", "service", `Total mechanic-hours budget: ${totalMechanicHours}. Running 0/1 knapsack optimisation on ${vehicles.length} tasks`);

    const { maxImpact, selectedTasks, usedHours } = knapsack(vehicles, totalMechanicHours);

    await Log("backend", "info", "controller", `Optimisation complete — ${selectedTasks.length} vehicles scheduled, total impact: ${maxImpact}, hours used: ${usedHours}/${totalMechanicHours}`);

    return res.status(200).json({
      availableMechanicHours: totalMechanicHours,
      usedMechanicHours: usedHours,
      totalVehiclesScheduled: selectedTasks.length,
      totalImpact: maxImpact,
      scheduledVehicles: selectedTasks,
    });
  } catch (err) {
    await Log("backend", "error", "controller", `Scheduling failed: ${err.message}`);
    return res.status(500).json({
      error: "Failed to generate maintenance schedule",
      details: err.message,
    });
  }
});

app.use((req, res) => {
  res.status(404).send("Route not found");
});

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`Vehicle Maintenance Scheduler running on port ${PORT}`);
});
