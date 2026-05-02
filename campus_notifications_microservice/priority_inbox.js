require("dotenv").config({ path: require("path").resolve(__dirname, "../.env"), quiet: true });
const axios = require("axios");

const BASE_URL = process.env["BASE-URL"];

const WEIGHTS = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function score(notification) {
  const weight = WEIGHTS[notification.Type] || 1;
  const ts = new Date(notification.Timestamp).getTime();
  return weight * 1e12 + ts;
}

async function getToken() {
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
  return res.data.access_token;
}

async function getPriorityInbox(topN = 10) {
  const token = await getToken();

  const res = await axios.get(`${BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const notifications = res.data.notifications;

  const sorted = notifications.sort((a, b) => score(b) - score(a));
  return sorted.slice(0, topN);
}

getPriorityInbox(10)
  .then((top10) => {
    console.log("Top 10 Priority Notifications\n");
    top10.forEach((n, i) => {
      console.log(`${i + 1}. [${n.Type}] ${n.Message}`);
      console.log(`   ID: ${n.ID}`);
      console.log(`   Timestamp: ${n.Timestamp}`);
      console.log();
    });
  })
  .catch((err) => {
    console.error("Failed to fetch priority inbox:", err.message);
  });
