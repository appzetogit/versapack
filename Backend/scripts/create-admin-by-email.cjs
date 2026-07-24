const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  const emailArg = (process.argv[2] || "").trim().toLowerCase();
  const passwordArg = (process.argv[3] || "").trim();
  const nameArg = (process.argv[4] || "Admin User").trim();

  if (!mongoUri) {
    throw new Error("Missing MONGO_URI/MONGODB_URI in Backend/.env");
  }
  if (!emailArg || !passwordArg) {
    throw new Error(
      "Usage: node scripts/create-admin-by-email.cjs <email> <password> [name]"
    );
  }

  await mongoose.connect(mongoUri);
  const adminCollection = mongoose.connection.collection("food_admins");
  const existing = await adminCollection.findOne({ email: emailArg });
  const hash = await bcrypt.hash(passwordArg, 10);

  if (existing) {
    await adminCollection.updateOne(
      { _id: existing._id },
      {
        $set: {
          password: hash,
          name: existing.name || nameArg,
          role: "ADMIN",
          isActive: true,
          servicesAccess: existing.servicesAccess?.length
            ? existing.servicesAccess
            : ["food", "quickCommerce", "taxi"],
          updatedAt: new Date(),
        },
      }
    );
    console.log(`Updated existing admin: ${emailArg}`);
  } else {
    await adminCollection.insertOne({
      email: emailArg,
      password: hash,
      name: nameArg,
      phone: "",
      profileImage: "",
      fcmTokens: [],
      fcmTokenMobile: [],
      role: "ADMIN",
      isActive: true,
      servicesAccess: ["food", "quickCommerce", "taxi"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created new admin: ${emailArg}`);
  }
}

run()
  .catch((err) => {
    console.error("Failed to create/update admin:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_e) {}
  });
