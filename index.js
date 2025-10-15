require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");

const app = express();

// 🔌 Middlewares
app.use(cors());
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


app.get("/", (req, res) => {
  res.json({ message: "Crownstandard API is running 🚀" });
});


app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ message: err.message || "Server Error" });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
