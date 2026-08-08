import { io } from "socket.io-client";
import { clientEnv } from "@/lib/env/client";
import type {
  FinalFrameSocket,
  SocketAuthenticationError,
} from "./contracts";

export interface RealtimeClientOptions {
  autoConnect?: boolean;
}

export function createRealtimeClient(
  options: RealtimeClientOptions = {},
): FinalFrameSocket {
  const apiUrl = new URL(clientEnv.NEXT_PUBLIC_API_URL);
  const basePath = apiUrl.pathname.replace(/\/$/, "");

  return io(apiUrl.origin, {
    path: `${basePath}/socket.io`.replace(/\/{2,}/g, "/"),
    autoConnect: options.autoConnect ?? false,
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.4,
    timeout: 10_000,
  });
}

export function getSocketErrorCode(error: unknown): string {
  const candidate = error as SocketAuthenticationError | null;
  return candidate?.data?.code || "SOCKET_CONNECTION_FAILED";
}

export function isTerminalSocketAuthenticationError(code: string): boolean {
  return [
    "SOCKET_AUTHENTICATION_FAILED",
    "SOCKET_USER_CONNECTION_LIMIT",
    "SOCKET_IP_CONNECTION_LIMIT",
  ].includes(code);
}
