import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const auth = getAuth();
const region = "us-central1";

export const grantPremium = onCall({ region }, async (request) => {
  assertAdmin(request);

  const uid = String(request.data?.uid || "").trim();
  const plan = String(request.data?.plan || "").trim();
  const requestId = String(request.data?.requestId || "").trim();

  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid.");
  }

  if (!["monthly", "yearly", "lifetime"].includes(plan)) {
    throw new HttpsError("invalid-argument", "Invalid premium plan.");
  }

  const userRecord = await auth.getUser(uid);
  const customClaims = userRecord.customClaims || {};

  await auth.setCustomUserClaims(uid, {
    ...customClaims,
    premium: true
  });

  await db.collection("users").doc(uid).set({
    isPremium: true,
    premiumPlan: plan,
    premiumUntil: getPremiumUntil(plan),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  if (requestId) {
    await db.collection("premiumRequests").doc(requestId).set({
      status: "approved",
      approvedBy: request.auth.uid,
      approvedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return {
    ok: true
  };
});

export const revokePremium = onCall({ region }, async (request) => {
  assertAdmin(request);

  const uid = String(request.data?.uid || "").trim();
  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid.");
  }

  const userRecord = await auth.getUser(uid);
  const customClaims = userRecord.customClaims || {};

  await auth.setCustomUserClaims(uid, {
    ...customClaims,
    premium: false
  });

  await db.collection("users").doc(uid).set({
    isPremium: false,
    premiumPlan: null,
    premiumUntil: null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    ok: true
  };
});

function assertAdmin(request) {
  if (request.auth?.token?.role !== "admin") {
    throw new HttpsError("permission-denied", "Admin role required.");
  }
}

function getPremiumUntil(plan) {
  if (plan === "lifetime") {
    return null;
  }

  const date = new Date();

  if (plan === "monthly") {
    date.setMonth(date.getMonth() + 1);
  }

  if (plan === "yearly") {
    date.setFullYear(date.getFullYear() + 1);
  }

  return Timestamp.fromDate(date);
}
