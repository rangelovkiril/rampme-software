import protobuf from "protobufjs";
import { config } from "../config";

let FeedMessage: protobuf.Type;

async function getDecoder() {
  if (!FeedMessage) {
    const root = await protobuf.load(config.protoPath);
    FeedMessage = root.lookupType("FeedMessage");
  }
  return FeedMessage;
}

async function fetchFeed(endpoint: string) {
  const decoder = await getDecoder();
  const res = await fetch(`${config.gtfs.realtimeBaseUrl}/${endpoint}`);
  if (!res.ok) throw new Error(`GTFS-RT ${endpoint}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return decoder.decode(buf).toJSON();
}

export const fetchAlerts = () => fetchFeed("alerts");
export const fetchTripUpdates = () => fetchFeed("trip-updates");
export const fetchVehiclePositions = () => fetchFeed("vehicle-positions");
