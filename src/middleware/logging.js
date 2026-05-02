const axios = require("axios");


const Log = async (stack, level, pkg, message) => {
  try {
    const response = await axios.post(
      `${process.env["BASE-URL"]}/logs`,
      {
        stack,
        level,
        package: pkg,
        message,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
      }
    );
    return response.data;
  } catch (err) {
    console.error("Logging failed:", err.message);
  }
};

const loggingMiddleware = (req, res, next) => {

  Log("backend", "info", "middleware", `${req.method} ${req.path}`).catch(err => {
    console.error("Logging failed:", err.message);
  });
  next();
};

module.exports = loggingMiddleware;
module.exports.Log = Log;