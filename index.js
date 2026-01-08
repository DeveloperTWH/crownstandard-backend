require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const cron = require("node-cron");
const cookieParser = require("cookie-parser");
const PayoutCron = require("./payout/cron/payoutCron");
const RetryWorker = require("./payout/workers/retryWorker");


const app = express();

const allowedOrigins = [
  "https://app.crownstandard.ca",
  "http://localhost:3000",
  "https://crownstandard-frontend.onrender.com"
];
// 🔌 Middlewares
app.use(cors({
  origin: function (origin, callback) {
    // allow Postman / server-to-server
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));



app.use("/api", require("./routes/webhookRoutes"));

app.use(cookieParser()); 
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(morgan("dev"));


connectDB();

// ================== (A) Enable Socket Server ==================
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: ["https://crownstandard.netlify.app", "http://localhost:3000", "https://app.crownstandard.ca"],
//     credentials: true
//   }
// });

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});


require("./sockets/chat.socket")(io);
// ================== (B) Attach io to req ==================
app.use((req, res, next) => {
  req.io = io;
  next();
});


// ✅ Routes
app.use("/auth", require("./routes/auth.routes"));
app.use("/users", require("./routes/user.routes"));
app.use("/categories", require("./routes/category.routes"));
app.use("/api/service", require("./routes/service.routes"));
app.use("/providers", require("./routes/provider.routes"));
app.use("/api/services", require("./routes/service.public.routes"));      // public
app.use("/api/service", require("./routes/service.routes"));             // provider (create/update/delete/my)
app.use("/api", require("./routes/bookingRoutes"));
app.use("/api", require("./routes/paymentRoutes"));
app.use("/api/chat", require("./routes/chat.routes"));
app.use("/admin", require("./routes/admin.routes"));


// admin payout routes
// app.use("/api/admin/payouts", require("./payout/controllers/payoutController"));


app.get("/", (req, res) => {
  res.json({ message: "Crownstandard API is running 🚀" });
});


app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ message: err.message || "Server Error" });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);

  // 🕒 Initialize payout automation
  console.log("🧭 Initializing payout cron jobs...");

  // Run payout cron every 1 hour
  cron.schedule("* * * * *", async () => {
    console.log("🕐 Running payout cron (hourly)...");
    try {
      await PayoutCron.runPayoutCron?.();
      console.log("✅ Hourly payout cron finished.");
    } catch (err) {
      console.error("❌ payoutCron error:", err.message);
    }
  });

  // Run retry worker every 30 minutes
  cron.schedule("* * * * *", async () => {
    console.log("♻️ Running retry worker (every 30 mins)...");
    try {
      await RetryWorker.processRetryQueue?.();
      console.log("✅ Retry worker finished.");
    } catch (err) {
      console.error("❌ Retry worker error:", err.message);
    }
  });
});

