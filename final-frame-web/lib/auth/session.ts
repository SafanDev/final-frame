import { getServerSession } from "next-auth";
import { authOptions } from "./options";

export function getCurrentSession() {
  return getServerSession(authOptions);
}
