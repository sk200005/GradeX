require("dotenv").config();
const mongoose = require("mongoose");
const { syncWarehouseCollections } = require("../utils/warehouse");

async function syncWarehouse() {
  await mongoose.connect(process.env.MONGODB_URI);
  await syncWarehouseCollections();

  console.log("Warehouse collections synced successfully.");
  await mongoose.disconnect();
}

syncWarehouse().catch(async (error) => {
  console.error("Warehouse sync failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
