import * as Ably from "ably";

import { ENV } from "./env.server";

const realtime = ENV.ABLY_API_KEY ? new Ably.Rest({ key: ENV.ABLY_API_KEY }) : null;

export function isRealtimeConfigured() {
  return realtime !== null;
}

export async function createUserRealtimeToken(userId: string, isStaff: boolean) {
  if (!realtime) throw new Error("Realtime is not configured.");
  const capability: Record<string, string[]> = {
    [`basny:account:${userId}`]: ["subscribe"],
  };
  if (isStaff) capability["basny:staff"] = ["subscribe"];
  return realtime.auth.createTokenRequest({
    clientId: `basny-user:${userId}`,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });
}

export async function createOrderRealtimeToken(reference: string) {
  if (!realtime) throw new Error("Realtime is not configured.");
  return realtime.auth.createTokenRequest({
    clientId: `basny-order:${reference}`,
    capability: JSON.stringify({ [`basny:order:${reference}`]: ["subscribe"] }),
    ttl: 60 * 60 * 1000,
  });
}

export async function createPublicCatalogueRealtimeToken() {
  if (!realtime) throw new Error("Realtime is not configured.");
  return realtime.auth.createTokenRequest({
    clientId: `basny-catalogue:${crypto.randomUUID()}`,
    capability: JSON.stringify({ "basny:catalogue": ["subscribe"] }),
    ttl: 60 * 60 * 1000,
  });
}

export async function publishAccountEvent(userId: string, name: string, data: Record<string, unknown>) {
  if (!realtime) return;
  try {
    await realtime.channels.get(`basny:account:${userId}`).publish(name, data);
  } catch {
    console.error(`Unable to publish account update (${name}).`);
  }
}

export async function publishStaffEvent(name: string, data: Record<string, unknown>) {
  if (!realtime) return;
  try {
    await realtime.channels.get("basny:staff").publish(name, data);
  } catch {
    console.error(`Unable to publish staff update (${name}).`);
  }
}

export async function publishPublicCatalogueEvent(_name: string, _data: Record<string, unknown>) {
  if (!realtime) return;
  try {
    await realtime.channels.get("basny:catalogue").publish("catalogue.changed", { at: new Date().toISOString() });
  } catch {
    console.error("Unable to publish public catalogue update.");
  }
}

export async function publishOrderEvent(reference: string, name: string, data: Record<string, unknown>) {
  if (!realtime) return;
  try {
    await realtime.channels.get(`basny:order:${reference}`).publish(name, data);
  } catch {
    console.error(`Unable to publish order update (${name}).`);
  }
}
