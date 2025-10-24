require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cron = require("node-cron");
const connectDB = require("./config/db");

const { router: healthRouter } = require("./routes/healthRoute");

const app = express();

// 🔌 Middlewares
app.use(cors());

app.use("/api", require("./routes/webhookRoutes"));

app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));


connectDB();

// ✅ Routes
app.use("/auth", require("./routes/auth.routes"));
app.use("/users", require("./routes/user.routes"));
app.use("/categories", require("./routes/category.routes"));
app.use("/service", require("./routes/service.routes"));
app.use("/providers", require("./routes/provider.routes"));
app.use("/services", require("./routes/service.public.routes"));      // public
app.use("/services", require("./routes/service.routes"));             // provider (create/update/delete/my)
app.use("/api", require("./routes/bookingRoutes"));
app.use("/api", require("./routes/paymentRoutes"));


app.get("/", (req, res) => {
  res.json({ message: "Crownstandard API is running 🚀" });
});

app.use("/", healthRouter);

// 🧠 Start background payout workers locally (optional)
// 🕒 Background Job Scheduling (Production Ready)
const PayoutWorker = require("./payout/workers/payoutWorker");
const RetryWorker = require("./payout/workers/retryWorker");

// ✅ Run payout worker every 1 hour
cron.schedule("*/1 * * * *", async () => {
  try {
    console.log("⏰ [Cron] Running hourly payout worker...");
    if (PayoutWorker.processPendingPayouts) {
      await PayoutWorker.processPendingPayouts();
    } else if (PayoutWorker.pollQueue) {
      console.log("ℹ️ Using pollQueue fallback");
      await PayoutWorker.pollQueue();
    }
    console.log("✅ [Cron] Payout worker completed successfully.");
  } catch (err) {
    console.error("❌ [Cron] Payout worker failed:", err);
  }
});

// ✅ Run retry worker every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    console.log("🔁 [Cron] Running retry worker (every 30 min)...");
    await RetryWorker.processFailedPayouts();
    console.log("✅ [Cron] Retry worker completed successfully.");
  } catch (err) {
    console.error("❌ [Cron] Retry worker failed:", err);
  }
});




app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ message: err.message || "Server Error" });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
