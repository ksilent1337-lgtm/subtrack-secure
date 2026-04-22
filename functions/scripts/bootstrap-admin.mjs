import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

initializeApp();

const auth = getAuth();
const email = process.env.SUBTRACK_ADMIN_EMAIL;
const displayName = process.env.SUBTRACK_ADMIN_DISPLAY_NAME || "SubTrack Admin";
const password = process.env.SUBTRACK_ADMIN_PASSWORD || randomBytes(24).toString("base64url");

if (!email) {
  throw new Error("SUBTRACK_ADMIN_EMAIL is required.");
}

let user;

try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, {
    password,
    displayName
  });
} catch (error) {
  user = await auth.createUser({
    email,
    password,
    displayName
  });
}

await auth.setCustomUserClaims(user.uid, {
  role: "admin",
  premium: true
});

console.log(JSON.stringify({
  uid: user.uid,
  email,
  displayName,
  password
}, null, 2));
