# Anubhav Parashar — RA2311003030535

This repo contains my submissions for the AffordMed Campus Hiring Evaluation.

## What's in here

**Logging Middleware** (`src/middleware/logging.js`)  
A reusable `Log(stack, level, package, message)` function that sends structured logs to the evaluation server. Used across all the microservices below.

**Vehicle Maintenance Scheduler** (`vehicle_maintenance_scheduler/`)  
A microservice that fetches depot mechanic hours and vehicle tasks from the evaluation APIs, then figures out the optimal set of vehicles to service using a 0/1 knapsack algorithm. Output is in `outputResult.txt`.

**Campus Notifications Microservice** (`campus_notifications_microservice/`)  
Design document covering REST API design, database schema, query optimisation, caching strategy, and a bulk notification system redesign across 6 stages. Stage 6 includes a working `priority_inbox.js` that fetches notifications and ranks the top 10 by type priority and recency.

## Running locally

```bash
npm install
```

Vehicle scheduler:
```bash
node vehicle_maintenance_scheduler/server.js
# runs on port 8001, hit GET /schedule
```

Priority inbox (Stage 6):
```bash
node campus_notifications_microservice/priority_inbox.js
```