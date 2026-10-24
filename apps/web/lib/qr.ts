import "server-only";
import QRCode from "qrcode";
import { env } from "./env";

export function joinUrl(code: string): string {
  return `${env.publicUrl()}/join/${code}`;
}

export async function joinQrSvg(code: string): Promise<string> {
  return QRCode.toString(joinUrl(code), { type: "svg", margin: 1, color: { dark: "#0f111a", light: "#ffffff" }, errorCorrectionLevel: "M" });
}
