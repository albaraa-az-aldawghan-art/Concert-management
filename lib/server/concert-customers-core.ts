import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { concertCustomerId, normalizeCustomerPhone } from "@/lib/concert-customers";
import { ApiError } from "@/lib/server/guard";

type DocData = Record<string, unknown>;

function millis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object") {
    const item = value as { seconds?: number; _seconds?: number };
    const seconds = Number(item.seconds ?? item._seconds);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: unknown): string | null {
  const time = millis(value);
  return time > 0 ? new Date(time).toISOString() : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export interface ConcertCustomerUpdate {
  name: string;
  primaryPhone: string;
  secondaryPhone: string | null;
  source: string | null;
  referralName: string | null;
  notes: string | null;
}

export async function listConcertCustomers(db: Firestore) {
  const [concertSnap, paymentSnap, profileSnap, userSnap] = await Promise.all([
    db.collection("concerts").get(),
    db.collection("concert_payments").get(),
    db.collection("concert_customers").get(),
    db.collection("users").get(),
  ]);

  const users = new Map(userSnap.docs.map((doc) => [doc.id, text(doc.data().name)]));
  const profiles = new Map<string, DocData & { id: string }>(profileSnap.docs.map((doc) => [doc.id, { id: doc.id, ...(doc.data() as DocData) }]));
  const phoneToProfile = new Map<string, string>();
  for (const [id, profile] of profiles) {
    const keys = Array.isArray(profile.phoneKeys) ? profile.phoneKeys : [];
    for (const key of keys) if (typeof key === "string" && key) phoneToProfile.set(key, id);
  }

  const paymentsByConcert = new Map<string, { id: string; data: DocData }[]>();
  for (const doc of paymentSnap.docs) {
    const data = doc.data() as DocData;
    const concertId = text(data.concertId);
    if (!concertId) continue;
    const list = paymentsByConcert.get(concertId) ?? [];
    list.push({ id: doc.id, data });
    paymentsByConcert.set(concertId, list);
  }

  const groups = new Map<string, { profileId: string; concerts: { id: string; data: DocData }[] }>();
  for (const doc of concertSnap.docs) {
    const data = doc.data() as DocData;
    const normalizedPhone = normalizeCustomerPhone(data.clientPhone);
    const profileId = text(data.customerId) || phoneToProfile.get(normalizedPhone) || concertCustomerId(data.clientPhone, doc.id);
    const group = groups.get(profileId) ?? { profileId, concerts: [] };
    group.concerts.push({ id: doc.id, data });
    groups.set(profileId, group);
  }

  const customers = [...groups.values()].map((group) => {
    const orderedByCreation = [...group.concerts].sort((a, b) => millis(a.data.createdAt) - millis(b.data.createdAt));
    const orderedByEvent = [...group.concerts].sort((a, b) => millis(b.data.date) - millis(a.data.date));
    const first = orderedByCreation[0];
    const latest = orderedByEvent[0];
    const profile = profiles.get(group.profileId);
    let totalValue = 0;
    let totalCollected = 0;
    let totalRemaining = 0;
    let totalRefunded = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let upcomingCount = 0;
    const customerPayments: Record<string, unknown>[] = [];

    const concerts = orderedByEvent.map(({ id, data }) => {
      const status = text(data.status) || "planned";
      const isCancelled = status === "cancelled";
      const eventPayments = (paymentsByConcert.get(id) ?? []).sort((a, b) => millis(b.data.createdAt) - millis(a.data.createdAt));
      const paid = eventPayments.reduce((sum, payment) => sum + amount(payment.data.amount), 0);
      const price = amount(data.price);
      const refund = amount(data.refundAmount);
      const remaining = isCancelled ? 0 : Math.max(0, price - paid);
      if (!isCancelled) {
        totalValue += price;
        totalCollected += paid;
        totalRemaining += remaining;
      }
      totalRefunded += refund;
      if (status === "completed") completedCount++;
      else if (isCancelled) cancelledCount++;
      else upcomingCount++;
      for (const payment of eventPayments) customerPayments.push({
        id: payment.id,
        concertId: id,
        concertNumber: data.concertNumber ?? null,
        amount: amount(payment.data.amount),
        method: text(payment.data.method),
        date: text(payment.data.date),
        createdAt: iso(payment.data.createdAt),
        createdBy: text(payment.data.createdBy),
        createdByName: users.get(text(payment.data.createdBy)) || "—",
      });
      return {
        id,
        concertNumber: data.concertNumber ?? null,
        date: iso(data.date),
        createdAt: iso(data.createdAt),
        venueName: text(data.venueName) || null,
        peopleCount: text(data.peopleCount) || null,
        status,
        price,
        paid,
        remaining,
        refundAmount: refund,
        invoiceNumber: text(data.invoiceNumber) || null,
      };
    });

    const primaryPhone = text(profile?.primaryPhone) || text(latest?.data.clientPhone);
    const secondaryPhone = text(profile?.secondaryPhone) || text(latest?.data.clientPhone2) || null;
    const firstCreatedBy = text(first?.data.createdBy);
    return {
      id: group.profileId,
      name: text(profile?.name) || text(latest?.data.clientName) || text(latest?.data.name) || "عميل بلا اسم",
      primaryPhone,
      secondaryPhone,
      source: text(profile?.source) || null,
      referralName: text(profile?.referralName) || null,
      notes: text(profile?.notes) || null,
      firstRegisteredAt: iso(first?.data.createdAt),
      firstCreatedBy,
      firstCreatedByName: users.get(firstCreatedBy) || "—",
      lastConcertAt: iso(latest?.data.date),
      concertCount: concerts.length,
      completedCount,
      cancelledCount,
      upcomingCount,
      totalValue,
      totalCollected,
      totalRemaining,
      totalRefunded,
      concerts,
      payments: customerPayments.sort((a, b) => String(b.date).localeCompare(String(a.date))),
    };
  });

  return customers.sort((a, b) => millis(b.lastConcertAt) - millis(a.lastConcertAt));
}

export async function updateConcertCustomer(
  db: Firestore,
  id: string,
  update: ConcertCustomerUpdate,
  uid: string,
) {
  if (!id || !/^(phone_|concert_)[A-Za-z0-9_-]+$/.test(id)) throw new ApiError("معرّف العميل غير صحيح");
  const primaryKey = normalizeCustomerPhone(update.primaryPhone);
  if (!primaryKey) throw new ApiError("رقم الجوال الأساسي مطلوب");

  const [profileSnap, concertsSnap] = await Promise.all([
    db.collection("concert_customers").doc(id).get(),
    db.collection("concerts").get(),
  ]);
  const oldKeys = Array.isArray(profileSnap.data()?.phoneKeys) ? profileSnap.data()!.phoneKeys as string[] : [];
  const matching = concertsSnap.docs.filter((doc) => {
    const data = doc.data();
    return data.customerId === id || (!data.customerId && concertCustomerId(data.clientPhone, doc.id) === id);
  });
  const phoneKeys = [...new Set([
    ...oldKeys,
    primaryKey,
    ...matching.map((doc) => normalizeCustomerPhone(doc.data().clientPhone)).filter(Boolean),
  ])];

  const writer = db.bulkWriter();
  writer.set(db.collection("concert_customers").doc(id), {
    ...update,
    phoneKeys,
    ...(profileSnap.exists ? {} : { createdAt: Timestamp.now(), createdBy: uid }),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  }, { merge: true });
  for (const concert of matching) writer.update(concert.ref, { customerId: id });
  await writer.close();
  return { ok: true, linkedConcerts: matching.length };
}

